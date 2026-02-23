import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import MultiSelectDropdown from './MultiSelectDropdown';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

describe('MultiSelectDropdown', () => {
  it('shows placeholder when nothing selected', () => {
    render(
      <MultiSelectDropdown
        options={options}
        selected={[]}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('shows count text and tags when selections present', () => {
    render(
      <MultiSelectDropdown
        options={options}
        selected={['a', 'b']}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    // t('common.selected', { count: 2 }) returns the key as-is in tests
    expect(screen.getByText('common.selected')).toBeInTheDocument();
    // Tags with labels are rendered
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('opens dropdown on button click and closes on second click', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={options}
        selected={[]}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    // Dropdown not visible initially
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

    // Click to open
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // Click again to close
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('calls onChange with added value when selecting an option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selected={[]}
        onChange={onChange}
        placeholder="Pick one"
      />
    );
    await user.click(screen.getByRole('button'));
    const checkbox = screen.getByRole('checkbox', { name: 'Alpha' });
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('calls onChange without removed value when deselecting an option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selected={['a', 'b']}
        onChange={onChange}
        placeholder="Pick one"
      />
    );
    // Use getAllByRole since tags also render buttons; first button is the main toggle
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);
    const checkbox = screen.getByRole('checkbox', { name: 'Alpha' });
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('removes tag when clicking X button on a tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultiSelectDropdown
        options={options}
        selected={['a', 'b']}
        onChange={onChange}
        placeholder="Pick one"
      />
    );
    // Tags are rendered; find the X buttons (svg buttons inside tags)
    // Each tag has one button child; there are 2 tags
    screen.getAllByRole('button').filter(
      (btn) => !btn.hasAttribute('type') || btn.getAttribute('type') === 'button'
    );
    // The first role="button" is the main toggle; tag X buttons follow
    // Find the X button inside the Alpha tag area
    // The tag section has buttons with onClick={() => toggle(val)}
    // We click the second button (first tag's X)
    const allButtons = screen.getAllByRole('button');
    // allButtons[0] = main toggle, allButtons[1] = X for 'a', allButtons[2] = X for 'b'
    await user.click(allButtons[1]);
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('shows "-" placeholder when options array is empty and dropdown is open', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelectDropdown
        options={[]}
        selected={[]}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows value as fallback label when selected value not in options', () => {
    render(
      <MultiSelectDropdown
        options={options}
        selected={['unknown-value']}
        onChange={vi.fn()}
        placeholder="Pick one"
      />
    );
    // Tag should display raw value as fallback (opt?.label ?? val)
    expect(screen.getByText('unknown-value')).toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MultiSelectDropdown
          options={options}
          selected={[]}
          onChange={vi.fn()}
          placeholder="Pick one"
        />
        <div data-testid="outside">Outside</div>
      </div>
    );

    // Open dropdown
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    // Click outside using fireEvent.mousedown on the document to trigger useClickOutside
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});
