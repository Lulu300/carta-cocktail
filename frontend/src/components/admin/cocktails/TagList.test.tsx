import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TagList from './TagList';
import { parseTags } from './parseTags';

describe('parseTags', () => {
  it.each([
    [null, []],
    [undefined, []],
    ['', []],
    ['  ,  , ', []],
    [' rum ,mint,,  tiki ', ['rum', 'mint', 'tiki']],
  ])('parses %j', (tags, expected) => {
    expect(parseTags(tags)).toEqual(expected);
  });
});

describe('TagList', () => {
  it('shows one badge per tag, a repeated tag included', () => {
    render(<TagList tags="rum, mint, rum" />);
    expect(screen.getAllByText('rum')).toHaveLength(2);
    expect(screen.getByText('mint')).toBeInTheDocument();
  });

  it('renders nothing without tags', () => {
    const { container } = render(<TagList tags=" , " />);
    expect(container).toBeEmptyDOMElement();
  });
});
