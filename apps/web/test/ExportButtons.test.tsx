import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportButtons } from '../src/components/ExportButtons.js';

describe('ExportButtons', () => {
  it('links to CSV and GeoJSON export with the current filters', () => {
    render(
      <ExportButtons
        bbox={[139, 35, 140, 36]}
        types={['bridge']}
        quality={['verified']}
        q="大橋"
        prefectureCode="13"
      />,
    );
    const csv = screen.getByRole('link', { name: /CSV 出力/ });
    const geojson = screen.getByRole('link', { name: /GeoJSON 出力/ });
    expect(csv.getAttribute('href')).toContain('/export?format=csv');
    expect(csv.getAttribute('href')).toContain('bbox=139%2C35%2C140%2C36');
    expect(csv.getAttribute('href')).toContain('types=bridge');
    expect(csv.getAttribute('href')).toContain('prefectureCode=13');
    expect(geojson.getAttribute('href')).toContain('format=geojson');
    expect(screen.getByText(/再配布条件/)).toBeInTheDocument();
  });

  it('omits an empty bbox from the links (country-wide view)', () => {
    render(
      <ExportButtons
        bbox={null}
        types={['bridge', 'river']}
        quality={['verified', 'review', 'reference']}
        q=""
      />,
    );
    const csv = screen.getByRole('link', { name: /CSV 出力/ });
    expect(csv.getAttribute('href')).not.toContain('bbox=');
    expect(csv.getAttribute('href')).toContain('types=bridge%2Criver');
  });
});
