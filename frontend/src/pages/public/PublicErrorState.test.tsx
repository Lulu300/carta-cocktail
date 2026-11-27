import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/test-utils';
import { AppProviders } from '../../test/appProviders';
import { ApiError } from '../../services/api';
import PublicErrorState from './PublicErrorState';

const notFound = { title: 'Menu not found', linkTo: '/', linkLabel: 'All menus' };

function renderState(error: Error, onRetry = vi.fn()) {
  render(
    <AppProviders>
      <PublicErrorState
        error={error}
        loadErrorTitle="Menu could not be loaded"
        notFound={notFound}
        onRetry={onRetry}
        isRetrying={false}
      />
    </AppProviders>,
  );
  return onRetry;
}

describe('PublicErrorState', () => {
  it('announces the title of a load error alone, not its retry button', async () => {
    const onRetry = renderState(new ApiError(500, 'Server error'));

    expect(screen.getByRole('alert')).toHaveTextContent(/^Menu could not be loaded$/);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('announces the title of a missing page alone, not its link', () => {
    renderState(new ApiError(404, 'Not found'));

    expect(screen.getByRole('alert')).toHaveTextContent(/^Menu not found$/);
    expect(screen.getByRole('link', { name: 'All menus' })).toBeInTheDocument();
  });
});
