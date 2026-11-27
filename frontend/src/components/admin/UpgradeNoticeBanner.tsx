import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcknowledgeUpgradeNotice, useUpgradeNotice } from '../../queries/system';
import type { RequiredAction } from '../../types';
import Button from '../ui/Button';

/** The reference for every upgrade: the banner is only a reminder of it. */
export const UPGRADING_GUIDE_URL =
  'https://github.com/Lulu300/carta-cocktail/blob/main/UPGRADING.md';

interface VersionActions {
  version: string;
  actions: string[];
}

/** Actions grouped by version, in the order the backend sends them: oldest version first. */
function groupByVersion(actions: RequiredAction[]): VersionActions[] {
  const groups: VersionActions[] = [];
  for (const { version, action } of actions) {
    const last = groups[groups.length - 1];
    if (last?.version === version) last.actions.push(action);
    else groups.push({ version, actions: [action] });
  }
  return groups;
}

function ActionList({ title, actions }: { title: string; actions: RequiredAction[] }) {
  const headingId = useId();
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-3">
      <h3 id={headingId} className="font-semibold text-fg">
        {title}
      </h3>
      {groupByVersion(actions).map(({ version, actions: versionActions }) => (
        <div key={version} className="mt-2">
          <h4 className="text-sm font-medium text-fg-muted">{`v${version}`}</h4>
          {/* Release notes are written in English: the actions are shown as they are */}
          <ol lang="en" className="mt-1 list-decimal pl-6 space-y-1 text-sm">
            {versionActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/**
 * Shown on every admin page after an upgrade, until the admin confirms the
 * required actions of the versions it skipped.
 */
export default function UpgradeNoticeBanner() {
  const { t } = useTranslation();
  const titleId = useId();
  const { data: notice } = useUpgradeNotice();
  const acknowledge = useAcknowledgeUpgradeNotice();

  if (!notice) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="border-b border-warning/40 bg-warning/10 px-6 py-4 text-fg"
    >
      <h2 id={titleId} className="text-lg font-semibold text-warning">
        {t('upgradeNotice.title', { from: notice.from, to: notice.to })}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t('upgradeNotice.intro')}</p>
      <ActionList
        title={t('upgradeNotice.before')}
        actions={notice.actions.filter(({ when }) => when === 'before')}
      />
      <ActionList
        title={t('upgradeNotice.after')}
        actions={notice.actions.filter(({ when }) => when === 'after')}
      />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="sm" loading={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
          {t('upgradeNotice.acknowledge')}
        </Button>
        <a
          href={UPGRADING_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-accent underline hover:text-accent-soft"
        >
          {t('upgradeNotice.guideLink')}
        </a>
      </div>
    </section>
  );
}
