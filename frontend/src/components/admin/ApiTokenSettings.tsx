import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  API_TOKEN_LIFETIME_DAYS,
  API_TOKEN_SCOPES,
  DEFAULT_API_TOKEN_LIFETIME_DAYS,
  type ApiToken,
  type ApiTokenScope,
  type CreatedApiToken,
} from '../../types';
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from '../../queries/apiTokens';
import { useConfirm } from '../../contexts/ConfirmContext';
import { formatDate } from '../../utils/dates';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CopyButton from '../ui/CopyButton';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Select from '../ui/Select';
import LoadError from './LoadError';

type Lifetime = (typeof API_TOKEN_LIFETIME_DAYS)[number];

const SCOPE_LABEL_KEYS: Record<ApiTokenScope, string> = {
  READ_ONLY: 'settings.apiTokens.readOnly',
  READ_WRITE: 'settings.apiTokens.readWrite',
};

/** The lifetime picked in the select, whose values are the strings of the allowed ones. */
function toLifetime(value: string): Lifetime {
  return (
    API_TOKEN_LIFETIME_DAYS.find((days) => String(days) === value) ??
    DEFAULT_API_TOKEN_LIFETIME_DAYS
  );
}

function isExpired(token: ApiToken): boolean {
  return Date.parse(token.expiresAt) <= Date.now();
}

/** The new token, shown until the admin closes it: the server never sends it again. */
function CreatedTokenPanel({ token, onDone }: { token: CreatedApiToken; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert
      tone="warning"
      size="md"
      title={t('settings.apiTokens.createdTitle', { name: token.name })}
    >
      <p>{t('settings.apiTokens.shownOnce')}</p>
      <Field label={t('settings.apiTokens.tokenLabel')}>
        <Input
          readOnly
          value={token.token}
          onFocus={(e) => e.target.select()}
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <CopyButton
          text={token.token}
          copiedMessage={t('settings.apiTokens.copied')}
          failedMessage={t('settings.apiTokens.copyFailed')}
        >
          {t('settings.apiTokens.copy')}
        </CopyButton>
        <Button variant="ghost" onClick={onDone}>
          {t('settings.apiTokens.done')}
        </Button>
      </div>
    </Alert>
  );
}

function ApiTokenRow({ token, onRevoke }: { token: ApiToken; onRevoke: () => void }) {
  const { t, i18n } = useTranslation();
  const date = (iso: string) => formatDate(iso, i18n.language);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-fg">
          <span className="font-medium">{token.name}</span>
          <span className="font-mono text-xs text-fg-muted">…{token.lastFour}</span>
          <Badge tone={token.scope === 'READ_WRITE' ? 'warning' : 'info'}>
            {t(SCOPE_LABEL_KEYS[token.scope])}
          </Badge>
          {isExpired(token) && <Badge tone="danger">{t('settings.apiTokens.expired')}</Badge>}
        </p>
        <p className="text-xs text-fg-muted">
          {t('settings.apiTokens.dates', {
            created: date(token.createdAt),
            expires: date(token.expiresAt),
          })}{' '}
          {token.lastUsedAt
            ? t('settings.apiTokens.lastUsed', { date: date(token.lastUsedAt) })
            : t('settings.apiTokens.neverUsed')}
        </p>
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={onRevoke}
        aria-label={t('settings.apiTokens.revokeNamed', { name: token.name })}
      >
        {t('settings.apiTokens.revoke')}
      </Button>
    </li>
  );
}

interface ApiTokenListProps {
  tokens: UseQueryResult<ApiToken[], Error>;
  onRevoke: (token: ApiToken) => void;
}

function ApiTokenList({ tokens, onRevoke }: ApiTokenListProps) {
  const { t } = useTranslation();
  if (tokens.isError) return <LoadError onRetry={() => void tokens.refetch()} />;
  if (tokens.isPending) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;
  if (tokens.data.length === 0) {
    return <p className="text-sm text-fg-muted">{t('settings.apiTokens.empty')}</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {tokens.data.map((token) => (
        <ApiTokenRow key={token.id} token={token} onRevoke={() => onRevoke(token)} />
      ))}
    </ul>
  );
}

/**
 * Tokens of scripts and MCP clients (F-16): create one, shown once, list them and revoke
 * them one by one. The API refuses these routes to the tokens themselves.
 */
export default function ApiTokenSettings() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const tokens = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('READ_ONLY');
  const [lifetime, setLifetime] = useState<Lifetime>(DEFAULT_API_TOKEN_LIFETIME_DAYS);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createToken.mutate(
      { name, scope, expiresInDays: lifetime },
      {
        onSuccess: (created) => {
          setCreatedToken(created);
          setName('');
        },
      },
    );
  };

  const handleRevoke = async (token: ApiToken) => {
    const confirmed = await confirm({
      title: t('settings.apiTokens.revokeTitle'),
      message: t('settings.apiTokens.confirmRevoke', { name: token.name }),
      confirmLabel: t('settings.apiTokens.revoke'),
      tone: 'danger',
    });
    if (!confirmed) return;
    revokeToken.mutate(token.id, {
      onSuccess: () => {
        if (createdToken?.id === token.id) setCreatedToken(null);
      },
    });
  };

  return (
    <section className="bg-surface border border-line rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-fg mb-2">{t('settings.apiTokens.title')}</h2>
      <p className="text-sm text-fg-muted mb-4">{t('settings.apiTokens.description')}</p>

      <form onSubmit={handleCreate} className="space-y-4">
        <Field
          label={t('settings.apiTokens.name')}
          hint={t('settings.apiTokens.nameHint')}
          required
        >
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.apiTokens.scope')}>
            <Select value={scope} onChange={(e) => setScope(e.target.value as ApiTokenScope)}>
              {API_TOKEN_SCOPES.map((option) => (
                <option key={option} value={option}>
                  {t(SCOPE_LABEL_KEYS[option])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.apiTokens.lifetime')}>
            <Select
              value={String(lifetime)}
              onChange={(e) => setLifetime(toLifetime(e.target.value))}
            >
              {API_TOKEN_LIFETIME_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t('settings.apiTokens.lifetimeDays', { count: days })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={createToken.isPending}>
          {t('settings.apiTokens.create')}
        </Button>
      </form>

      {createdToken && (
        <div className="mt-6">
          <CreatedTokenPanel token={createdToken} onDone={() => setCreatedToken(null)} />
        </div>
      )}

      <hr className="border-line my-6" />

      <ApiTokenList tokens={tokens} onRevoke={handleRevoke} />
    </section>
  );
}
