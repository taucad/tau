// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteFooter as DesktopRouteFooter } from '#components/layout/route-footer.desktop.js';

describe('desktop route footer', () => {
  it('should render no web footer', () => {
    expect(render(<DesktopRouteFooter />).container).toBeEmptyDOMElement();
  });
});
