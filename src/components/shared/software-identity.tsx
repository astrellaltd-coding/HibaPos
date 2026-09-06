// L-53 (Batch 3.7) — the running software names itself on the fiscal screen.
//
// A pure component on purpose: no hooks, no fetch, so a test can render it
// with `react-dom/server` and read the words back. The value comes from
// `GET /api/fiscal/verify`, i.e. from the SERVER that is running, not from
// whatever the client bundle was built with — the two are the same today and
// would not be after a half-applied update, which is the case a control is
// interested in.

export type SoftwareIdentityDto = { name: string; version: string };

export function SoftwareIdentity({ software }: { software: SoftwareIdentityDto | undefined }) {
  if (!software) return null;
  return (
    <div className="rounded-lg border px-3 py-2.5" data-testid="software-identity">
      <p className="text-sm font-medium text-foreground">
        Logiciel : {software.name} — version {software.version}
      </p>
      <p className="text-xs text-muted-foreground">
        C&apos;est la version que l&apos;attestation individuelle de l&apos;éditeur doit désigner et
        que l&apos;administration rapproche des attestations détenues lors d&apos;un contrôle.
      </p>
    </div>
  );
}
