import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UploadedPhoto from './UploadedPhoto';

function renderPhoto(imagePath: string) {
  return render(<UploadedPhoto imagePath={imagePath} sizes="100vw" alt="Mojito" />);
}

describe('UploadedPhoto', () => {
  it('offers the smaller copies of the photo, decoded off the main thread', () => {
    renderPhoto('mojito.webp');
    const photo = screen.getByRole('img', { name: 'Mojito' });

    expect(photo).toHaveAttribute('src', '/uploads/mojito.webp');
    expect(photo).toHaveAttribute('srcset', expect.stringContaining('/uploads/mojito-480.webp'));
    expect(photo).toHaveAttribute('sizes', '100vw');
    expect(photo).toHaveAttribute('decoding', 'async');
  });

  it('falls back to the photo itself when its copy is missing', () => {
    renderPhoto('1700000000-42.jpg');
    const photo = screen.getByRole('img', { name: 'Mojito' });

    fireEvent.error(photo);

    expect(photo).not.toHaveAttribute('srcset');
    expect(photo).toHaveAttribute('src', '/uploads/1700000000-42.jpg');
  });

  it('tries the copies again for another photo', () => {
    const { rerender } = renderPhoto('old.jpg');
    fireEvent.error(screen.getByRole('img', { name: 'Mojito' }));

    rerender(<UploadedPhoto imagePath="new.webp" sizes="100vw" alt="Mojito" />);

    expect(screen.getByRole('img', { name: 'Mojito' })).toHaveAttribute(
      'srcset',
      expect.stringContaining('/uploads/new-480.webp'),
    );
  });
});
