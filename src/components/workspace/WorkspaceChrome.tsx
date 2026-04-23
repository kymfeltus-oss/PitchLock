import type { ReactNode } from 'react';
import type { WorkspacePublic } from '@/lib/workspace';
import { normalizeWorkspacePrimaryColor } from '@/lib/branding';

function platformFooterEnabled(workspace: WorkspacePublic): boolean {
  if (!workspace.show_powered_by) return false;
  return process.env.NEXT_PUBLIC_SHOW_PLATFORM_FOOTER === 'true';
}

function platformName(): string {
  return process.env.NEXT_PUBLIC_PLATFORM_NAME?.trim() || 'Platform';
}

export function WorkspaceChrome({
  workspace,
  children,
}: {
  workspace: WorkspacePublic;
  children: ReactNode;
}) {
  const accent = normalizeWorkspacePrimaryColor(workspace.primary_color) ?? '#18181b';
  const showFooter = platformFooterEnabled(workspace);

  return (
    <div
      className="flex min-h-full flex-col bg-zinc-50 text-zinc-900"
      style={{ ['--workspace-primary' as string]: accent }}
    >
      <header
        className="border-b border-zinc-200 bg-white"
        style={{ borderBottomColor: `${accent}33` }}
      >
        <div className="mx-auto flex max-w-5xl items-start gap-4 px-4 py-4 sm:items-center">
          {workspace.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-controlled arbitrary logo URLs
            <img
              src={workspace.logo_url}
              alt=""
              className="h-10 w-auto max-w-[220px] shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{workspace.name}</h1>
            {workspace.tagline ? (
              <p className="mt-1 text-sm leading-snug text-zinc-600">{workspace.tagline}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {showFooter ? (
        <footer className="border-t border-zinc-200 bg-white px-4 py-3 text-center text-xs text-zinc-500">
          Powered by {platformName()}
        </footer>
      ) : null}
    </div>
  );
}
