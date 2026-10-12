import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileDropzone from './FileDropzone';

function renderDropzone(props: Partial<Parameters<typeof FileDropzone>[0]> = {}) {
  const onFile = vi.fn();
  const onReject = vi.fn();
  render(<FileDropzone accept=".json,.zip" onFile={onFile} onReject={onReject} label="Drop a file" {...props} />);
  return { onFile, onReject, button: screen.getByRole('button', { name: /Drop a file/ }) };
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileDropzone', () => {
  it('opens the file picker from the keyboard', async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const { button } = renderDropzone();

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('passes a dropped file of an accepted type', () => {
    const { onFile, onReject, button } = renderDropzone();
    const file = new File(['{}'], 'Recipe.JSON', { type: 'application/json' });

    fireEvent.dragOver(button, { dataTransfer: { files: [file] } });
    fireEvent.drop(button, { dataTransfer: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('rejects a dropped file the accept filter excludes', () => {
    const { onFile, onReject, button } = renderDropzone();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    fireEvent.drop(button, { dataTransfer: { files: [file] } });

    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(file);
  });

  it('applies the same filter to a picked file', () => {
    const { onFile, onReject } = renderDropzone();
    const accepted = new File(['zip'], 'recipes.zip', { type: 'application/zip' });
    const refused = new File(['x'], 'recipes.csv', { type: 'text/csv' });

    fireEvent.change(fileInput(), { target: { files: [accepted] } });
    fireEvent.change(fileInput(), { target: { files: [refused] } });

    expect(onFile).toHaveBeenCalledWith(accepted);
    expect(onReject).toHaveBeenCalledWith(refused);
  });

  it('ignores a drop without a file', () => {
    const { onFile, onReject, button } = renderDropzone();

    fireEvent.drop(button, { dataTransfer: { files: [] } });

    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('shows the chosen file name', () => {
    renderDropzone({ fileName: 'bottles.csv' });

    expect(screen.getByText('bottles.csv')).toBeInTheDocument();
  });

  it('marks the zone while a file is dragged over it', () => {
    const { button } = renderDropzone();

    fireEvent.dragOver(button);
    expect(button).toHaveClass('border-accent');
    fireEvent.dragLeave(button);
    expect(button).not.toHaveClass('border-accent');
  });
});
