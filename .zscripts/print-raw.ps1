# HibaPOS - envoi RAW vers une imprimante Windows (Batch 1.3d, L-70).
#
# Deux modes :
#   -List                        liste les files d'impression visibles par Windows
#   -PrinterName x -InputFile y  envoie le contenu de y a la file x, tel quel
#
# POURQUOI CE DETOUR. L'imprimante Sunso WTP-801 est branchee en USB type B.
# Windows la pilote par une file d'impression (son INF declare
# USBPRINT\SUNSOWTP-800036C, c'est-a-dire une imprimante USB, pas un port COM),
# et le seul moyen de lui envoyer de l'ESC/POS sans qu'un pilote le reformate
# est un travail de type "RAW" passe au spouleur. Node n'a pas d'API pour cela ;
# winspool.drv en a une. Ce script est cette API, et rien d'autre.
#
# CE SCRIPT N'ECRIT AUCUN FICHIER ET NE SUPPRIME RIEN. Il lit -InputFile et
# parle au spouleur. L'appelant cree et efface le fichier temporaire.
#
# Sortie : "OK <octets>" et code 0, sinon "ERR ..." et un code non nul.
#   2 = file d'impression introuvable    3 = le spouleur a refuse le travail
#   4 = ecriture incomplete ou refusee   5 = fichier d'entree absent
#
# ASCII pur et BOM UTF-8 obligatoires (garde de deployment.test.ts) : Windows
# PowerShell 5.1 lit un .ps1 sans BOM comme de l'ANSI, et un accent dans une
# chaine devient alors un guillemet fermant qui termine la chaine.
param(
  [switch]$List,
  [string]$PrinterName,
  [string]$InputFile
)
$ErrorActionPreference = "Stop"

if ($List) {
  # Win32_Printer plutot que Get-Printer : present sur toutes les editions,
  # y compris celles ou le module PrintManagement n'est pas installe.
  Get-CimInstance Win32_Printer | ForEach-Object { $_.Name }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterName)) { Write-Output "ERR NO_PRINTER"; exit 2 }
if (-not (Test-Path -LiteralPath $InputFile)) { Write-Output "ERR NO_INPUT"; exit 5 }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class HibaRawPrint
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    // 0 = envoye. Sinon un code d'etape negatif, avec l'erreur Win32 dans err.
    // Le type de donnees est "RAW" : le spouleur transmet les octets tels
    // quels, sans passer par le rendu du pilote. C'est toute la raison d'etre
    // de ce fichier, et changer cette chaine casse l'ESC/POS.
    public static int Send(string printer, byte[] bytes, string docName, out int err, out int written)
    {
        err = 0; written = 0;
        IntPtr h = IntPtr.Zero;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) { err = Marshal.GetLastWin32Error(); return -2; }
        try
        {
            DOCINFOW di = new DOCINFOW();
            di.pDocName = docName;
            di.pOutputFile = null;
            di.pDataType = "RAW";
            if (StartDocPrinter(h, 1, ref di) == 0) { err = Marshal.GetLastWin32Error(); return -3; }
            try
            {
                if (!StartPagePrinter(h)) { err = Marshal.GetLastWin32Error(); return -4; }
                IntPtr buf = Marshal.AllocHGlobal(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, buf, bytes.Length);
                    if (!WritePrinter(h, buf, bytes.Length, out written)) { err = Marshal.GetLastWin32Error(); return -5; }
                }
                finally { Marshal.FreeHGlobal(buf); }
                if (written != bytes.Length) { return -6; }
                EndPagePrinter(h);
            }
            finally { EndDocPrinter(h); }
        }
        finally { ClosePrinter(h); }
        return 0;
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes($InputFile)
$err = 0
$written = 0
$rc = [HibaRawPrint]::Send($PrinterName, $bytes, "HibaPOS", [ref]$err, [ref]$written)
if ($rc -eq 0) { Write-Output ("OK " + $written); exit 0 }

Write-Output ("ERR step=" + $rc + " win32=" + $err + " written=" + $written + " expected=" + $bytes.Length)
if ($rc -eq -2) { exit 2 }
if ($rc -eq -3) { exit 3 }
exit 4
