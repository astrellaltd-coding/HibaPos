#!/bin/sh

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# 存储所有子进程的 PID
pids=""

# 清理函数：优雅关闭所有服务
cleanup() {
    echo ""
    echo "🛑 正在关闭所有服务..."
    
    # 发送 SIGTERM 信号给所有子进程
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            echo "   关闭进程 $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done
    
    # 等待所有进程退出（最多等待 5 秒）
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            # 如果还在运行，等待最多 4 秒
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # 如果仍然在运行，强制关闭
            if kill -0 "$pid" 2>/dev/null; then
                echo "   强制关闭进程 $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done
    
    echo "✅ 所有服务已关闭"
    exit 0
}

echo "🚀 开始启动所有服务..."
echo ""

# 切换到构建目录
cd "$BUILD_DIR" || exit 1

ls -lah

DEFAULT_PACKAGED_DB_PATH="/app/db/custom.db"
DEFAULT_PACKAGED_DATABASE_URL="file:$DEFAULT_PACKAGED_DB_PATH?_fk=1&_busy_timeout=5000"
DEFAULT_MIGRATIONS_DIR="/app/prisma/migrations"

# Python 依赖在构建阶段安装进部署产物，不复用 Sandbox 的 /home/z/.venv。
# Next.js 及其启动的子进程都会继承这组路径。
if [ -d "/app/python-runtime/site-packages" ]; then
    export PYTHONPATH="/app/python-runtime/site-packages:/app/next-service-dist${PYTHONPATH:+:$PYTHONPATH}"
    export PATH="/app/python-runtime/site-packages/bin:$PATH"
    export PYTHONDONTWRITEBYTECODE=1
    export PYTHONUNBUFFERED=1
    echo "🐍 已启用部署包内 Python runtime: $(python --version 2>&1)"
fi

# 启动 Next.js 服务器
if [ -f "./next-service-dist/server.js" ]; then
    echo "🚀 启动 Next.js 服务器..."
    cd next-service-dist/ || exit 1

    # 设置环境变量
    export NODE_ENV=production
    export PORT="${PORT:-3000}"
    export HOSTNAME="${HOSTNAME:-0.0.0.0}"
    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_PACKAGED_DATABASE_URL}"

    if [ "$DATABASE_URL" = "$DEFAULT_PACKAGED_DATABASE_URL" ]; then
        if [ ! -f "$DEFAULT_PACKAGED_DB_PATH" ]; then
            # 构建产物不再内嵌 SQLite 文件 —— 首次启动自动初始化空库：
            # 1. prisma migrate deploy (应用打包的 migrations)
            # 2. 基础数据由应用层的登录界面「Initialiser」按钮触发
            #    POST /api/seed 完成（创建用户/目录/FiscalCounter）——
            #    这是设计好的首启 UX；CLI 的 `prisma db seed` 依赖打包产物中
            #    不存在的 src/ 模块，因此不在此处调用。
            echo "ℹ️  $DEFAULT_PACKAGED_DB_PATH introuvable — initialisation via prisma migrate deploy"
            mkdir -p "$(dirname "$DEFAULT_PACKAGED_DB_PATH")"
            if [ -d "$DEFAULT_MIGRATIONS_DIR" ]; then
                # bunx resolves the prisma CLI from the packaged package.json
                # (copied by build.sh); migrations live in ./prisma.
                cd /app || exit 1
                bunx prisma migrate deploy --schema=/app/prisma/schema.prisma
                cd - || exit 1
            else
                echo "❌ Aucun dossier Prisma migrations trouvé ($DEFAULT_MIGRATIONS_DIR); impossible d'initialiser la DB."
                exit 1
            fi
        fi

        # Apply WAL once on a freshly-bootstrapped SQLite file so concurrent
        # reader/writer throughput during busy shifts is decent. WAL is a
        # persistent file-level setting; safe to re-apply on every boot.
        if command -v sqlite3 >/dev/null 2>&1; then
            sqlite3 "$DEFAULT_PACKAGED_DB_PATH" "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || true
        else
            echo "⚠️  sqlite3 CLI missing — journal_mode=WAL non appliqué. MySQLite utilisera le mode rollback par défaut."
        fi

        echo "🗄️  当前使用打包数据库: $DEFAULT_PACKAGED_DB_PATH"
    else
        echo "🗄️  当前使用外部指定数据库: $DATABASE_URL"
    fi

    # Load secrets from .env when present (platform env vars win — we only
    # fill the gaps). Next standalone does NOT auto-load .env files, and
    # missing SESSION_SECRET would 500 every authed route at import time.
    if [ -f "/app/.env" ]; then
        set -a
        . /app/.env
        set +a
        echo "🔑 Env chargé depuis /app/.env"
    fi
    if [ -z "$SESSION_SECRET" ]; then
        echo "⚠️  SESSION_SECRET non défini — les routes d'auth échoueront. Définissez-le via l'environnement de la plateforme ou /app/.env"
    fi
    
    # 后台启动 Next.js
    bun server.js &
    NEXT_PID=$!
    pids="$NEXT_PID"
    
    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Next.js 服务器启动失败"
        exit 1
    else
        echo "✅ Next.js 服务器已启动 (PID: $NEXT_PID, Port: $PORT)"
    fi
    
    cd ../
else
    echo "⚠️  未找到 Next.js 服务器文件: ./next-service-dist/server.js"
fi

# 启动 mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 启动 mini-services..."
    
    # 运行启动脚本（从根目录运行，脚本内部会处理 mini-services-dist 目录）
    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"
    
    # 等待一小段时间检查进程是否成功启动
    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  mini-services 可能启动失败，但继续运行..."
    else
        echo "✅ mini-services 已启动 (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  未找到 mini-services 启动脚本，但目录存在"
else
    echo "ℹ️  mini-services 目录不存在，跳过"
fi

# 启动 Caddy（如果存在 Caddyfile）
echo "🚀 启动 Caddy..."

# Caddy 作为前台进程运行（主进程）
echo "✅ Caddy 已启动（前台运行）"
echo ""
echo "🎉 所有服务已启动！"
echo ""
echo "💡 按 Ctrl+C 停止所有服务"
echo ""

# Caddy 作为主进程运行
exec caddy run --config Caddyfile --adapter caddyfile
