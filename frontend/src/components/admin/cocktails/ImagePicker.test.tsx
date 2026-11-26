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
    await user.upload(screen.getByLabelText('Image'), file);

    expect(onChange).toHaveBeenCalledWith(file);
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
  });

  describe('photo size', () => {
    // MAX_IMAGE_BYTES of backend/src/services/cocktail/cocktailImage.ts, the largest photo it accepts
    const BACKEND_LIMIT = 5 * 1024 * 1024;

    /** A photo of `size` bytes: only its size is read, so no 5 MB buffer is allocated. */
    const photoOfSize = (size: number) => {
      const file = pngFile('big.png');
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };

    it.each([
      ['one byte under the backend limit', BACKEND_LIMIT - 1],
      ['exactly the backend limit', BACKEND_LIMIT],
    ])('accepts a photo of %s', async (_case, size) => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ImagePicker imagePath={null} onChange={onChange} />);

      const file = photoOfSize(size);
      await user.upload(screen.getByLabelText('Image'), file);

      expect(onChange).toHaveBeenCalledWith(file);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('refuses a photo one byte over the backend limit, and keeps the photo chosen before', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const { container } = render(<ImagePicker imagePath={null} onChange={onChange} />);
      const input = screen.getByLabelText('Image');
      await user.upload(input, pngFile('small.png'));

      await user.upload(input, photoOfSize(BACKEND_LIMIT + 1));

      expect(screen.getByRole('alert')).toHaveTextContent('The file or request is too large');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
    });

    it('forgets the refusal when a smaller photo is chosen next', async () => {
      const user = userEvent.setup();
      render(<ImagePicker imagePath={null} onChange={vi.fn()} />);
      const input = screen.getByLabelText('Image');
      await user.upload(input, photoOfSize(BACKEND_LIMIT + 1));

      await user.upload(input, pngFile('small.png'));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('revokes the previous preview when another file is picked, and the last one on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ImagePicker imagePath={null} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Image');

    await user.upload(input, pngFile('a.png'));
    await user.upload(input, pngFile('b.png'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview-2');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });
});
