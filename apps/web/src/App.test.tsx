import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the studio heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: /drama15 lite studio/i }),
    ).toBeInTheDocument();
  });
});
