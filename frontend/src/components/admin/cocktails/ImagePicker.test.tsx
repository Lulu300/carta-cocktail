import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import ImagePicker from './ImagePicker';

const pngFile = (name: string) => new File(['img'], name, { type: 'image/png' });

describe('ImagePicker', () => {
  let nextUrl = 0;

  beforeEach(() => {
    nextUrl = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++nextUrl}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the stored image until a file is picked', () => {
    const { container } = render(<ImagePicker imagePath="mojito.jpg" onChange={vi.fn()} />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('mojito.jpg');
  });

  it('previews the picked file and reports it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<ImagePicker imagePath={null} onChange={onChange} />);
    expect(container.querySelector('img')).toBeNull();

    const file = pngFile('a.png');
    await user.upload(screen.getByLabelText('cocktails.image'), file);

    expect(onChange).toHaveBeenCalledWith(file);
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
  });

  it('revokes the previous preview when another file is picked, and the last one on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ImagePicker imagePath={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('cocktails.image');

    await user.upload(input, pngFile('a.png'));
    await user.upload(input, pngFile('b.png'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview-2');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });
});
