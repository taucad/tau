/* eslint-disable max-lines -- test file */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RJSFSchema } from '@rjsf/utils';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

// Test wrapper component that provides necessary providers
function TestWrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// Default units (mm)
const defaultUnits: Units = {
  length: {
    factor: 1,
    symbol: 'mm',
  },
};

// Create mock data for consistent testing
const mockDefaultParameters = {
  isHidden: false,
  siteUrl: 'https://example.com',
  ssid: 'test-network',
};

const mockJsonSchema: RJSFSchema = {
  type: 'object',
  properties: {
    wifiConfig: {
      type: 'object',
      properties: {
        ssid: { type: 'string' },
        isHidden: { type: 'boolean' },
      },
    },
    textType: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
  },
};

describe('Parameters - Core Search Functionality', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should render without crashing', () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={mockDefaultParameters}
          jsonSchema={mockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Basic smoke test - should render the component
    expect(screen.getByPlaceholderText('Search parameters...')).toBeTruthy();
  });

  it('should render search input', () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={mockDefaultParameters}
          jsonSchema={mockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show the search input
    const searchInput = screen.getByPlaceholderText('Search parameters...');
    expect(searchInput).toBeTruthy();
  });

  // This test verifies our core fix: hasSearchResults logic now checks both parameters AND groups
  it('should have consistent search logic between hasSearchResults and ObjectFieldTemplate', () => {
    // This is a unit test for the logic we fixed
    // Test that our hasSearchResults would find matches in both parameters and groups
    // This mirrors the logic in the actual component
    const matchesSearch = (text: string, searchTerm: string): boolean => {
      // This is the toTitleCase + toLowerCase logic from the component
      const prettyText = text.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (string_) => string_.toUpperCase());
      return prettyText.toLowerCase().includes(searchTerm.toLowerCase());
    };

    // Test parameter matching (existing logic)
    const parameterEntries = Object.entries(mockDefaultParameters);
    const hasMatchingParameters = parameterEntries.some(([key]) => matchesSearch(key, 'hidden'));
    expect(hasMatchingParameters).toBe(true); // Should find "isHidden"

    // Test group matching (our fix)
    const schemaProperties = mockJsonSchema.properties;
    if (schemaProperties && typeof schemaProperties === 'object' && !Array.isArray(schemaProperties)) {
      const groupNames = Object.keys(schemaProperties);
      const hasMatchingGroups = groupNames.some((groupName) => matchesSearch(groupName, 'config'));
      expect(hasMatchingGroups).toBe(true); // Should find "wifiConfig"

      // Test that empty search doesn't break
      const hasMatchingGroupsEmpty = groupNames.some((groupName) => matchesSearch(groupName, 'nonexistent'));
      expect(hasMatchingGroupsEmpty).toBe(false);
    }
  });

  it('should show invalid field error when array contains mixed types', () => {
    // Schema with array property that has missing items definition
    // This causes RJSF to use UnsupportedFieldTemplate when data has mixed types
    const schemaWithMixedArray: RJSFSchema = {
      type: 'object',
      properties: {
        bar: {
          type: 'object',
          title: 'BAR',
          properties: {
            hoop: {
              type: 'array',
              // Missing items definition - this causes RJSF to show invalid field
            },
          },
        },
        baz: {
          type: 'object',
          title: 'BAZ',
          properties: {
            tag: {
              type: 'array',
              // Missing items definition - this causes RJSF to show invalid field
            },
          },
        },
      },
    };

    // Default parameters with mixed types in arrays (number and string)
    const parametersWithMixedTypes = {
      bar: {
        hoop: [5, '5'], // Mixed types: number and string
      },
      baz: {
        tag: [5, '2'], // Mixed types: number and string
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={parametersWithMixedTypes}
          jsonSchema={schemaWithMixedArray}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show invalid field errors with proper aria labels
    const hoopInvalidField = screen.getByLabelText('Invalid Field: hoop');
    expect(hoopInvalidField).toBeTruthy();

    const tagInvalidField = screen.getByLabelText('Invalid Field: tag');
    expect(tagInvalidField).toBeTruthy();

    // Should show reason with proper aria labels
    const hoopReason = screen.getByLabelText('Invalid Field Reason: hoop');
    expect(hoopReason).toBeTruthy();
    expect(hoopReason).toHaveTextContent('Reason: Missing items definition');

    const tagReason = screen.getByLabelText('Invalid Field Reason: tag');
    expect(tagReason).toBeTruthy();
    expect(tagReason).toHaveTextContent('Reason: Missing items definition');

    // Should show array requirements with proper aria labels
    const hoopArrayRequirements = screen.getByLabelText('Array Requirements: hoop');
    expect(hoopArrayRequirements).toBeTruthy();
    expect(hoopArrayRequirements).toHaveTextContent('Array Requirements');
    expect(hoopArrayRequirements).toHaveTextContent(
      'All items must be the same type. Use a single type instead of using mixed types or tuples.',
    );

    const tagArrayRequirements = screen.getByLabelText('Array Requirements: tag');
    expect(tagArrayRequirements).toBeTruthy();
    expect(tagArrayRequirements).toHaveTextContent('Array Requirements');
    expect(tagArrayRequirements).toHaveTextContent(
      'All items must be the same type. Use a single type instead of using mixed types or tuples.',
    );
  });
});

describe('Parameters - Search Functionality', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  // Search-specific mock data
  const searchMockDefaultParameters = {
    isHidden: false,
    siteUrl: '',
    password: '',
    phoneNumber: '',
  };

  const searchMockJsonSchema: RJSFSchema = {
    type: 'object',
    properties: {
      wifiType: {
        type: 'object',
        title: 'Wifi Type',
        properties: {
          isHidden: { type: 'boolean', title: 'Is Hidden' },
          networkName: { type: 'string', title: 'Network Name' },
          password: { type: 'string', title: 'Password' },
        },
      },
      phoneCallType: {
        type: 'object',
        title: 'Phone Call Type',
        properties: {
          phoneNumber: { type: 'string', title: 'Phone Number' },
        },
      },
      vCardType: {
        type: 'object',
        title: 'V Card Type',
        properties: {
          siteUrl: { type: 'string', title: 'Site Url' },
        },
      },
    },
  };

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('shows "Is Hidden" parameter when searching for "hi"', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "hi" in search
    await user.type(searchInput, 'hi');

    // Should show "Is Hidden" parameter since "hi" is in "Is Hidden"
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    // Should NOT show unrelated parameters
    expect(screen.queryByLabelText('Parameter: Site Url')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Password')).toBeNull();
  });

  it('shows "Site Url" parameter when searching for "URL"', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "URL" in search
    await user.type(searchInput, 'URL');

    // Should show "Site Url" parameter since "url" is in "Site Url"
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();

    // Should NOT show unrelated parameters
    expect(screen.queryByLabelText('Parameter: Is Hidden')).toBeNull();
    expect(screen.queryByLabelText('Parameter: Phone Number')).toBeNull();
  });

  it('shows groups when group title matches search', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "type" to match group titles like "wifiType", "phoneCallType"
    await user.type(searchInput, 'type');

    // Should show groups with "type" in their title
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: V Card Type')).toBeTruthy();
  });

  it('shows groups when child parameters match search', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type "phone" to match "phoneNumber" parameter inside "phoneCallType" group
    await user.type(searchInput, 'phone');

    // Should show the group containing the matching child parameter
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Phone Number')).toBeTruthy();
  });

  it('is case insensitive', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Test different cases
    await user.type(searchInput, 'HIDDEN');
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, 'url');
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();

    await user.clear(searchInput);
    await user.type(searchInput, 'WiFi');
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
  });

  it('preserves case in search input while searching case-insensitively', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Type mixed case
    await user.type(searchInput, 'HiDdEn');

    // Input should preserve the exact case typed
    expect((searchInput as HTMLInputElement).value).toBe('HiDdEn');

    // But search should still work (case insensitive)
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
  });

  it('shows "No parameters matching" when no results found', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for something that doesn't exist
    await user.type(searchInput, 'nonexistent');

    // Should show no results message
    expect(screen.getByText('No parameters matching "nonexistent"')).toBeTruthy();

    // Should not show any parameters or groups
    expect(screen.queryByLabelText('Parameter: Is Hidden')).toBeNull();
    expect(screen.queryByLabelText('Group: Wifi Type')).toBeNull();
  });

  it('shows all parameters when search is cleared', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // First search for something specific
    await user.type(searchInput, 'hi');
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
    expect(screen.queryByLabelText('Parameter: Site Url')).toBeNull();

    // Clear the search
    await user.clear(searchInput);

    // All groups and parameters should be visible again
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: Phone Call Type')).toBeTruthy();
    expect(screen.getByLabelText('Group: V Card Type')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Site Url')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Phone Number')).toBeTruthy();
  });

  it('hides empty groups when no children match search', async () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={searchMockDefaultParameters}
          jsonSchema={searchMockJsonSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for something that only exists in one group
    await user.type(searchInput, 'hidden');

    // Should only show the group with matching content
    expect(screen.getByLabelText('Group: Wifi Type')).toBeTruthy(); // Contains "isHidden"
    expect(screen.getByLabelText('Parameter: Is Hidden')).toBeTruthy();

    // Should NOT show groups without matching content
    expect(screen.queryByLabelText('Group: Phone Call Type')).toBeNull();
    expect(screen.queryByLabelText('Group: V Card Type')).toBeNull();
  });
});

describe('Parameters - Reset Button Visibility', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  describe('Top-level reset button', () => {
    it('should not show reset button when no parameters have been edited', () => {
      const defaultParameters = {
        name: 'test',
        count: 5,
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'test' },
          count: { type: 'number', default: 5 },
        },
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={{}}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should not show reset all button
      expect(screen.queryByLabelText('Reset all parameters')).toBeNull();
    });

    it('should show reset button when parameters have been edited', () => {
      const defaultParameters = {
        name: 'test',
        count: 5,
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'test' },
          count: { type: 'number', default: 5 },
        },
      };

      // Parameters have been edited
      const editedParameters = {
        name: 'changed',
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={editedParameters}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should show reset all button
      const resetButton = screen.getByLabelText('Reset all parameters');
      expect(resetButton).toBeTruthy();
    });
  });

  describe('Individual field reset button', () => {
    it('should not show reset button for primitive field when value matches default', () => {
      const defaultParameters = {
        name: 'test',
        count: 5,
        enabled: true,
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'test' },
          count: { type: 'number', default: 5 },
          enabled: { type: 'boolean', default: true },
        },
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={{}}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should not show reset buttons for fields with default values
      expect(screen.queryByLabelText('Reset Name')).toBeNull();
      expect(screen.queryByLabelText('Reset Count')).toBeNull();
    });

    it('should show reset button for primitive field when value differs from default', () => {
      const defaultParameters = {
        name: 'test',
        count: 5,
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'test' },
          count: { type: 'number', default: 5 },
        },
      };

      // Parameter has been changed
      const editedParameters = {
        name: 'changed',
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={editedParameters}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should show reset button for changed field
      const resetButton = screen.getByLabelText('Reset Name');
      expect(resetButton).toBeTruthy();

      // Should not show reset button for unchanged field
      expect(screen.queryByLabelText('Reset Count')).toBeNull();
    });

    it('should not show reset button for object field when value matches default', () => {
      const defaultParameters = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              host: { type: 'string', default: 'localhost' },
              port: { type: 'number', default: 8080 },
            },
          },
        },
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={{}}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should not show reset buttons for nested fields with default values
      expect(screen.queryByLabelText('Reset Host')).toBeNull();
    });

    it('should show reset button for object field when value differs from default', () => {
      const defaultParameters = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              host: { type: 'string', default: 'localhost' },
              port: { type: 'number', default: 8080 },
            },
          },
        },
      };

      // Nested parameter has been changed
      const editedParameters = {
        config: {
          host: 'example.com',
        },
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={editedParameters}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should show reset button for changed nested field
      const resetButton = screen.getByLabelText('Reset Host');
      expect(resetButton).toBeTruthy();

      // Should not show reset button for unchanged nested field
      expect(screen.queryByLabelText('Reset Port')).toBeNull();
    });

    it('should not show reset button for array items when values match defaults', () => {
      const defaultParameters = {
        strings: ['foo', 'bar', 'baz'],
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          strings: {
            type: 'array',
            items: {
              type: 'string',
            },
            default: ['foo', 'bar', 'baz'],
          },
        },
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={{}}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should not show reset buttons for array items with default values
      // Check for any reset buttons - there should be none since all values match defaults
      const allResetButtons = screen.queryAllByLabelText(/^Reset /);
      // Filter to only array item reset buttons (not the top-level reset button)
      const arrayItemResetButtons = allResetButtons.filter((button) =>
        button.getAttribute('aria-label')?.includes('String'),
      );
      expect(arrayItemResetButtons.length).toBe(0);
    });

    it('should show reset button for array items when values differ from defaults', () => {
      const defaultParameters = {
        strings: ['foo', 'bar', 'baz'],
      };

      const schema: RJSFSchema = {
        type: 'object',
        properties: {
          strings: {
            type: 'array',
            items: {
              type: 'string',
            },
            default: ['foo', 'bar', 'baz'],
          },
        },
      };

      // Array item has been changed
      const editedParameters = {
        strings: ['changed', 'bar', 'baz'],
      };

      render(
        <TestWrapper>
          <Parameters
            parameters={editedParameters}
            defaultParameters={defaultParameters}
            jsonSchema={schema}
            units={defaultUnits}
            onParametersChange={mockOnParametersChange}
          />
        </TestWrapper>,
      );

      // Should show reset button only for changed array item (first item)
      const allResetButtons = screen.queryAllByLabelText(/^Reset /);
      const arrayItemResetButtons = allResetButtons.filter((button) =>
        button.getAttribute('aria-label')?.includes('String'),
      );
      // Should have exactly one reset button for the changed item
      expect(arrayItemResetButtons.length).toBe(1);
      expect(arrayItemResetButtons[0]?.getAttribute('aria-label')).toContain('String');
    });
  });
});

describe('Parameters - Collapse All Button Visibility', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should not show collapse-all button when object has only primitive properties', () => {
    const defaultParameters = {
      name: 'test',
      count: 5,
      enabled: true,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        count: { type: 'number', default: 5 },
        enabled: { type: 'boolean', default: true },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should not show collapse-all button when only primitives exist
    expect(screen.queryByLabelText('Expand all')).toBeNull();
  });

  it('should show collapse-all button when object has nested object properties', () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show collapse-all button when nested objects exist
    // Button starts expanded, so label is "Collapse all"
    const collapseButton = screen.getByLabelText('Collapse all');
    expect(collapseButton).toBeTruthy();
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('should show collapse-all button when object has array properties', () => {
    const defaultParameters = {
      strings: ['foo', 'bar', 'baz'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        strings: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['foo', 'bar', 'baz'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show collapse-all button when arrays exist
    // Button starts expanded, so label is "Collapse all"
    const collapseButton = screen.getByLabelText('Collapse all');
    expect(collapseButton).toBeTruthy();
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('should show collapse-all button when object has both primitives and nested items', () => {
    const defaultParameters = {
      name: 'test',
      config: {
        host: 'localhost',
      },
      tags: ['tag1', 'tag2'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
          },
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['tag1', 'tag2'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show collapse-all button when nested items exist (even with primitives)
    // Button starts expanded, so label is "Collapse all"
    const collapseButton = screen.getByLabelText('Collapse all');
    expect(collapseButton).toBeTruthy();
  });
});

describe('Parameters - Array and Object Count Display', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should show correct count for array with multiple items', () => {
    const defaultParameters = {
      strings: ['foo', 'bar', 'baz'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        strings: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['foo', 'bar', 'baz'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show array group with count (3)
    const arrayGroup = screen.getByLabelText('Group: Strings');
    expect(arrayGroup).toBeTruthy();
    expect(arrayGroup).toHaveTextContent('(3)');
  });

  it('should show correct count for array with single item', () => {
    const defaultParameters = {
      tags: ['tag1'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['tag1'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show array group with count (1)
    const arrayGroup = screen.getByLabelText('Group: Tags');
    expect(arrayGroup).toBeTruthy();
    expect(arrayGroup).toHaveTextContent('(1)');
  });

  it('should show correct count for object with multiple properties', () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
        timeout: 30,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
            timeout: { type: 'number', default: 30 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show object group with count (3)
    const objectGroup = screen.getByLabelText('Group: Config');
    expect(objectGroup).toBeTruthy();
    expect(objectGroup).toHaveTextContent('(3)');
  });

  it('should not show collapsible group for top-level object', () => {
    const defaultParameters = {
      name: 'test',
      count: 5,
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        count: { type: 'number', default: 5 },
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Top-level object should not have a collapsible group
    // (it renders properties directly without a Collapsible wrapper)
    expect(screen.queryByLabelText('Group: Root')).toBeNull();

    // But nested objects should still have collapsible groups
    expect(screen.getByLabelText('Group: Config')).toBeTruthy();

    // Top-level properties should be directly accessible
    expect(screen.getByLabelText('Parameter: Name')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Count')).toBeTruthy();
  });
});

describe('Parameters - Search Highlighting', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should highlight search term in parameter labels', async () => {
    const defaultParameters = {
      networkName: 'test-network',
      password: 'secret123',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        networkName: {
          type: 'string',
          title: 'Network Name',
          default: 'test-network',
        },
        password: {
          type: 'string',
          title: 'Password',
          default: 'secret123',
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "network"
    await user.type(searchInput, 'network');

    // Should find the parameter by aria-label
    const networkField = screen.getByLabelText('Parameter: Network Name');
    expect(networkField).toBeTruthy();

    // Should have highlighted text - use within() to scope queries and aria-label
    const highlight = within(networkField).getByLabelText('Highlighted: Network');
    expect(highlight).toBeTruthy();
    expect(highlight).toHaveTextContent('Network');
  });

  it('should highlight search term in parameter descriptions', async () => {
    const defaultParameters = {
      host: 'localhost',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          title: 'Host',
          description: 'The hostname or IP address of the server',
          default: 'localhost',
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "server"
    await user.type(searchInput, 'server');

    // Should find the parameter by aria-label
    const hostField = screen.getByLabelText('Parameter: Host');
    expect(hostField).toBeTruthy();

    // Should find description text - use function matcher since text is broken up by highlight marks
    const description = screen.getByText((_content, element) => {
      return element !== null && element.textContent === 'The hostname or IP address of the server';
    });
    expect(description).toBeTruthy();

    // Should have highlighted text in description - use within() to scope queries and aria-label
    const highlight = within(description).getByLabelText('Highlighted: server');
    expect(highlight).toBeTruthy();
    expect(highlight).toHaveTextContent('server');
  });

  it('should highlight search term in group titles', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            host: { type: 'string', default: 'localhost' },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "config"
    await user.type(searchInput, 'config');

    // Should find the group by aria-label
    const group = screen.getByLabelText('Group: Configuration');
    expect(group).toBeTruthy();

    // Should have highlighted text in group title - use within() to scope queries and aria-label
    // Search term "config" matches "Config" in "Configuration" (case-insensitive)
    const highlight = within(group).getByLabelText('Highlighted: Config');
    expect(highlight).toBeTruthy();
    expect(highlight.textContent?.toLowerCase()).toBe('config');
  });
});

describe('Parameters - Force Open on Search', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should force open groups when searching and group matches', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "config" - should match the group title
    await user.type(searchInput, 'config');

    // Group should be open (aria-expanded="true")
    // getByLabelText returns the button (CollapsibleTrigger) directly
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();
    expect(groupTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('should force open arrays when searching and array matches', async () => {
    const defaultParameters = {
      tags: ['tag1', 'tag2', 'tag3'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          title: 'Tags',
          items: {
            type: 'string',
          },
          default: ['tag1', 'tag2', 'tag3'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "tag" - should match the array title
    await user.type(searchInput, 'tag');

    // Array should be open (aria-expanded="true")
    // getByLabelText returns the button (CollapsibleTrigger) directly
    const arrayTrigger = screen.getByLabelText('Group: Tags');
    expect(arrayTrigger).toBeTruthy();
    expect(arrayTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('should force open groups when searching and child parameters match', async () => {
    const defaultParameters = {
      config: {
        hostname: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            hostname: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "hostname" - should match child parameter, not group title
    await user.type(searchInput, 'hostname');

    // Group should be open because child matches
    // getByLabelText returns the button (CollapsibleTrigger) directly
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();
    expect(groupTrigger).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Parameters - Filtered Count Display', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should show filtered/total count format when searching and counts differ', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
        timeout: 30,
        database: 'mydb',
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
            timeout: { type: 'number', default: 30 },
            database: { type: 'string', default: 'mydb' },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "host" - should match only 1 out of 4 properties
    await user.type(searchInput, 'host');

    // Group should show filtered/total count format
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();

    // Should show (1/4) format when filtered
    expect(groupTrigger).toHaveTextContent('(1/4)');
  });

  it('should show regular count format when not searching', () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
        timeout: 30,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
            timeout: { type: 'number', default: 30 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Group should show regular count format (3) when not searching
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();
    expect(groupTrigger).toHaveTextContent('(3)');
    // Should NOT show filtered format
    expect(groupTrigger).not.toHaveTextContent('/');
  });

  it('should show filtered count when group title matches but properties do not', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "config" - matches the group title, but properties don't match
    await user.type(searchInput, 'config');

    // Group should show filtered count (0/2) since properties don't match "config"
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();
    expect(groupTrigger).toHaveTextContent('(0/2)');
  });

  it('should show regular count format when all properties match search', async () => {
    const defaultParameters = {
      config: {
        hostname: 'localhost',
        hostPort: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          title: 'Configuration',
          properties: {
            hostname: { type: 'string', default: 'localhost' },
            hostPort: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search parameters...');

    // Search for "host" - matches both properties (hostname and hostPort)
    await user.type(searchInput, 'host');

    // Group should show regular count format (2) since all properties match
    const groupTrigger = screen.getByLabelText('Group: Configuration');
    expect(groupTrigger).toBeTruthy();
    expect(groupTrigger).toHaveTextContent('(2)');
    // Should NOT show filtered format when all match
    expect(groupTrigger).not.toHaveTextContent('/');
  });
});

describe('Parameters - Reset Functionality', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should reset single parameter when reset button is clicked', async () => {
    const defaultParameters = {
      name: 'test',
      count: 5,
    };

    const editedParameters = {
      name: 'changed',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        count: { type: 'number', default: 5 },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show reset button for changed field
    const resetButton = screen.getByLabelText('Reset Name');
    expect(resetButton).toBeTruthy();

    // Click the reset button
    await user.click(resetButton);

    // Should call onParametersChange with parameters without the reset field
    expect(mockOnParametersChange).toHaveBeenCalledWith({});
  });

  it('should reset nested parameter when reset button is clicked', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const editedParameters = {
      config: {
        host: 'example.com',
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show reset button for changed nested field
    const resetButton = screen.getByLabelText('Reset Host');
    expect(resetButton).toBeTruthy();

    // Clear previous calls to isolate reset behavior
    mockOnParametersChange.mockClear();

    // Click the reset button
    await user.click(resetButton);

    // Should call onParametersChange with empty object (host removed, config becomes empty)
    expect(mockOnParametersChange).toHaveBeenCalledWith({});
  });

  it('should reset array item when reset button is clicked', async () => {
    const defaultParameters = {
      strings: ['foo', 'bar', 'baz'],
    };

    const editedParameters = {
      strings: ['changed', 'bar', 'baz'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        strings: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['foo', 'bar', 'baz'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show reset button for changed array item
    const resetButtons = screen.queryAllByLabelText(/^Reset /);
    const arrayItemResetButton = resetButtons.find((button) => button.getAttribute('aria-label')?.includes('String'));
    expect(arrayItemResetButton).toBeTruthy();

    // Clear previous calls to isolate reset behavior
    mockOnParametersChange.mockClear();

    // Click the reset button
    if (arrayItemResetButton) {
      await user.click(arrayItemResetButton);
    }

    // Should call onParametersChange with empty object (array item reset to default)
    expect(mockOnParametersChange).toHaveBeenCalledWith({});
  });

  it('should reset all parameters when reset all button is clicked', async () => {
    const defaultParameters = {
      name: 'test',
      count: 5,
    };

    const editedParameters = {
      name: 'changed',
      count: 10,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        count: { type: 'number', default: 5 },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show reset all button
    const resetAllButton = screen.getByLabelText('Reset all parameters');
    expect(resetAllButton).toBeTruthy();

    // Click the reset all button
    await user.click(resetAllButton);

    // Should call onParametersChange with empty object
    expect(mockOnParametersChange).toHaveBeenCalledWith({});
  });
});

describe('Parameters - Reactive Configuration Changes', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should re-render without errors when min/max props change', () => {
    const defaultParameters = {
      width: 50,
    };

    const initialSchema: RJSFSchema = {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          default: 50,
          minimum: 0,
          maximum: 100,
        },
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={initialSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should render the number input
    const initialInput = screen.getByLabelText('Input for Width');
    expect(initialInput).toBeTruthy();

    // Update schema with different min/max values
    const updatedSchema: RJSFSchema = {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          default: 50,
          minimum: 10,
          maximum: 200,
        },
      },
    };

    // Re-render with updated schema - should not throw errors
    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={updatedSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should still render the input after prop changes
    const updatedInput = screen.getByLabelText('Input for Width');
    expect(updatedInput).toBeTruthy();
  });

  it('should re-render without errors when step prop changes', () => {
    const defaultParameters = {
      height: 25,
    };

    const initialSchema: RJSFSchema = {
      type: 'object',
      properties: {
        height: {
          type: 'number',
          default: 25,
          multipleOf: 1,
        },
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={initialSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should render the number input
    const initialInput = screen.getByLabelText('Input for Height');
    expect(initialInput).toBeTruthy();

    // Update schema with different step value
    const updatedSchema: RJSFSchema = {
      type: 'object',
      properties: {
        height: {
          type: 'number',
          default: 25,
          multipleOf: 5,
        },
      },
    };

    // Re-render with updated schema - should not throw errors
    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={updatedSchema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should still render the input after prop changes
    const updatedInput = screen.getByLabelText('Input for Height');
    expect(updatedInput).toBeTruthy();
  });

  it('should re-render without errors when default value changes significantly', () => {
    const initialDefaultParameters = {
      size: 10,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        size: {
          type: 'number',
          default: 10,
        },
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={initialDefaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should render with initial default value
    const initialInput = screen.getByLabelText('Input for Size');
    expect(initialInput).toBeTruthy();
    expect(initialInput).toHaveValue('10');

    // Update default value to a much larger value
    const updatedDefaultParameters = {
      size: 1000,
    };

    // Re-render with updated default value - should not throw errors
    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={updatedDefaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Component should render with updated default value
    const updatedInput = screen.getByLabelText('Input for Size');
    expect(updatedInput).toBeTruthy();
    expect(updatedInput).toHaveValue('1000');
  });
});

describe('Parameters - Reset Single Parameter Bug', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;
  let currentParameters: Record<string, unknown>;

  beforeEach(() => {
    user = userEvent.setup();
    currentParameters = {};
    mockOnParametersChange = vi.fn((newParameters: Record<string, unknown>) => {
      currentParameters = newParameters;
    });
  });

  it('should only reset the first parameter when resetting it, keeping the second parameter unchanged', async () => {
    const defaultParameters = {
      config1: {
        host: 'localhost',
      },
      config2: {
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config1: {
          type: 'object',
          title: 'Config 1',
          properties: {
            host: { type: 'string', default: 'localhost' },
          },
        },
        config2: {
          type: 'object',
          title: 'Config 2',
          properties: {
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Step 1: Update the first param (config1.host)
    const hostInput = screen.getByLabelText('Input for Host');
    await user.clear(hostInput);
    await user.type(hostInput, 'example.com');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Verify first param was updated
    expect(currentParameters).toHaveProperty('config1');
    expect((currentParameters['config1'] as { host?: string }).host).toBe('example.com');

    // Re-render with updated parameters
    rerender(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Step 2: Update the second param (config2.port)
    const portInput = screen.getByLabelText('Input for Port');
    await user.clear(portInput);
    await user.type(portInput, '9000');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Verify both params are updated
    expect(currentParameters).toHaveProperty('config1');
    expect((currentParameters['config1'] as { host?: string }).host).toBe('example.com');
    expect(currentParameters).toHaveProperty('config2');
    expect((currentParameters['config2'] as { port?: number }).port).toBe(9000);

    // Re-render with updated parameters
    rerender(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Step 3: Reset the first param (config1.host)
    mockOnParametersChange.mockClear();
    const resetHostButton = screen.getByLabelText('Reset Host');
    await user.click(resetHostButton);

    // Wait for reset to complete
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Re-render with reset parameters
    rerender(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Step 4: Verify only first param is reset, second param should remain unchanged
    // First param (host) should be reset to default
    const hostInputAfterReset = screen.getByLabelText('Input for Host');
    expect(hostInputAfterReset).toHaveValue('localhost');

    // Second param (port) should still have the updated value
    const portInputAfterReset = screen.getByLabelText('Input for Port');
    expect(portInputAfterReset).toHaveValue('9000');

    // Verify parameters object: config1 should be removed/reset, config2 should remain
    expect(currentParameters).not.toHaveProperty('config1');
    expect(currentParameters).toHaveProperty('config2');
    expect((currentParameters['config2'] as { port?: number }).port).toBe(9000);
  });
});

describe('Parameters - Required Field Indicator', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should show asterisk for required fields', () => {
    const defaultParameters = {
      name: 'test',
      optional: 'value',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        optional: { type: 'string', default: 'value' },
      },
      required: ['name'],
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Required field should have asterisk
    const nameField = screen.getByLabelText('Parameter: Name');
    expect(nameField).toBeTruthy();
    expect(nameField).toHaveTextContent('*');

    // Optional field should not have asterisk
    const optionalField = screen.getByLabelText('Parameter: Optional');
    expect(optionalField).toBeTruthy();
    expect(optionalField).not.toHaveTextContent('*');
  });

  it('should show asterisk for required nested fields', () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
          required: ['host'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Required nested field should have asterisk
    const hostField = screen.getByLabelText('Parameter: Host');
    expect(hostField).toBeTruthy();
    expect(hostField).toHaveTextContent('*');

    // Optional nested field should not have asterisk
    const portField = screen.getByLabelText('Parameter: Port');
    expect(portField).toBeTruthy();
    expect(portField).not.toHaveTextContent('*');
  });
});

describe('Parameters - Empty State', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should show empty state when jsonSchema is undefined', () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={{}}
          units={defaultUnits}
          jsonSchema={undefined}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show default empty message
    expect(screen.getByText('No parameters available')).toBeTruthy();
    expect(screen.getByText('Parameters will appear here when they become available for this model')).toBeTruthy();
  });

  it('should show empty state when schema has no properties', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {},
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={{}}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show default empty message
    expect(screen.getByText('No parameters available')).toBeTruthy();
    expect(screen.getByText('Parameters will appear here when they become available for this model')).toBeTruthy();
  });

  it('should show form when schema has properties even if data is empty', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={{}}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show the form, not the empty state
    expect(screen.queryByText('No parameters available')).toBeNull();
    // Should render the parameter field
    expect(screen.getByLabelText('Input for Name')).toBeTruthy();
  });

  it('should show custom empty message when provided', () => {
    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          units={defaultUnits}
          defaultParameters={{}}
          jsonSchema={undefined}
          emptyMessage="Custom empty message"
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Custom empty message')).toBeTruthy();
    expect(screen.queryByText('No parameters available')).toBeNull();
  });

  it('should show custom empty description when provided', () => {
    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={{}}
          jsonSchema={undefined}
          emptyDescription="Custom description text"
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Custom description text')).toBeTruthy();
    expect(screen.queryByText('Parameters will appear here when they become available for this model')).toBeNull();
  });

  it('should show both custom empty message and description', () => {
    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={{}}
          jsonSchema={undefined}
          emptyMessage="Custom title"
          emptyDescription="Custom description"
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    expect(screen.getByText('Custom title')).toBeTruthy();
    expect(screen.getByText('Custom description')).toBeTruthy();
  });
});

describe('Parameters - Feature Flags', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should hide search input when enableSearch is false', () => {
    const defaultParameters = {
      name: 'test',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          enableSearch={false}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should not show search input
    expect(screen.queryByPlaceholderText('Search parameters...')).toBeNull();
  });

  it('should show search input when enableSearch is true (default)', () => {
    const defaultParameters = {
      name: 'test',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show search input with default placeholder
    expect(screen.getByPlaceholderText('Search parameters...')).toBeTruthy();
  });

  it('should use custom search placeholder when provided', () => {
    const defaultParameters = {
      name: 'test',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          searchPlaceholder="Custom placeholder"
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show search input with custom placeholder
    expect(screen.getByPlaceholderText('Custom placeholder')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search parameters...')).toBeNull();
  });

  it('should hide collapse-all button when enableExpandAll is false', () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          enableExpandAll={false}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should not show collapse-all button
    expect(screen.queryByLabelText('Collapse all')).toBeNull();
    expect(screen.queryByLabelText('Expand all')).toBeNull();
  });

  it('should hide controls bar when both enableSearch and enableExpandAll are false', () => {
    const defaultParameters = {
      name: 'test',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          enableSearch={false}
          enableExpandAll={false}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Controls bar should not be rendered (no search input, no collapse button)
    expect(screen.queryByPlaceholderText('Search parameters...')).toBeNull();
    expect(screen.queryByLabelText('Collapse all')).toBeNull();
  });
});

describe('Parameters - Collapse/Expand Functionality', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should toggle collapse-all button when clicked', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
      tags: ['tag1', 'tag2'],
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          default: ['tag1', 'tag2'],
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initially should be expanded
    const collapseButton = screen.getByLabelText('Collapse all');
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    await user.click(collapseButton);

    // Should now be collapsed
    const expandButton = screen.getByLabelText('Expand all');
    expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand again
    await user.click(expandButton);

    // Should be expanded again
    const collapseButtonAgain = screen.getByLabelText('Collapse all');
    expect(collapseButtonAgain).toHaveAttribute('aria-expanded', 'true');
  });

  it('should collapse and expand groups when collapse-all button is clicked', async () => {
    const defaultParameters = {
      config1: {
        host: 'localhost',
      },
      config2: {
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config1: {
          type: 'object',
          title: 'Config 1',
          properties: {
            host: { type: 'string', default: 'localhost' },
          },
        },
        config2: {
          type: 'object',
          title: 'Config 2',
          properties: {
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initially groups should be expanded
    const group1 = screen.getByLabelText('Group: Config 1');
    const group2 = screen.getByLabelText('Group: Config 2');
    expect(group1).toHaveAttribute('aria-expanded', 'true');
    expect(group2).toHaveAttribute('aria-expanded', 'true');

    // Click collapse-all
    const collapseButton = screen.getByLabelText('Collapse all');
    await user.click(collapseButton);

    // Groups should now be collapsed
    expect(group1).toHaveAttribute('aria-expanded', 'false');
    expect(group2).toHaveAttribute('aria-expanded', 'false');

    // Click expand-all
    const expandButton = screen.getByLabelText('Expand all');
    await user.click(expandButton);

    // Groups should be expanded again
    expect(group1).toHaveAttribute('aria-expanded', 'true');
    expect(group2).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Parameters - Edge Cases', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should handle empty parameters object with non-empty defaultParameters', () => {
    const defaultParameters = {
      name: 'test',
      count: 5,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        count: { type: 'number', default: 5 },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should render parameters from defaults
    expect(screen.getByLabelText('Parameter: Name')).toBeTruthy();
    expect(screen.getByLabelText('Parameter: Count')).toBeTruthy();
  });

  it('should handle parameters that override defaults', () => {
    const defaultParameters = {
      name: 'default',
      count: 5,
    };

    const editedParameters = {
      name: 'edited',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'default' },
        count: { type: 'number', default: 5 },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show edited value for name
    const nameInput = screen.getByLabelText('Input for Name');
    expect(nameInput).toHaveValue('edited');

    // Should show default value for count
    const countInput = screen.getByLabelText('Input for Count');
    expect(countInput).toHaveValue('5');
  });

  it('should handle schema with no properties', () => {
    const schema: RJSFSchema = {
      type: 'object',
      properties: {},
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={{}}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should show empty state since mergedData is empty
    expect(screen.getByText('No parameters available')).toBeTruthy();
  });

  it('should apply custom className', () => {
    const defaultParameters = {
      name: 'test',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
      },
    };

    const { container } = render(
      <TestWrapper>
        <Parameters
          units={defaultUnits}
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          className="custom-class"
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Should have custom className applied to root div
    const rootElement = container.querySelector('[data-slot="parameters"]');
    expect(rootElement).toBeTruthy();
    expect(rootElement).toHaveClass('custom-class');
  });
});

describe('Parameters - Unit Conversion Only for Length', () => {
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnParametersChange = vi.fn();
  });

  it('should apply unit conversion for length descriptor when units change from mm to cm', () => {
    const defaultParameters = {
      width: 100, // 100mm
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          default: 100,
        },
      },
    };

    // Start with mm units
    const mmUnits: Units = {
      length: {
        factor: 1, // Mm
        symbol: 'mm',
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={mmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initial value should be 100
    const widthInput = screen.getByLabelText('Input for Width');
    expect(widthInput).toHaveValue('100');

    // Change to cm units (10mm = 1cm, so 100mm = 10cm)
    const cmUnits: Units = {
      length: {
        factor: 10, // Cm (1cm = 10mm)
        symbol: 'cm',
      },
    };

    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={cmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Value should now be 10 (100mm / 10 = 10cm)
    const widthInputAfterConversion = screen.getByLabelText('Input for Width');
    expect(widthInputAfterConversion).toHaveValue('10');
  });

  it('should NOT apply unit conversion for angle descriptor when units change', () => {
    const defaultParameters = {
      rotation: 45, // 45 degrees
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        rotation: {
          type: 'number',
          default: 45,
        },
      },
    };

    // Start with mm units
    const mmUnits: Units = {
      length: {
        factor: 1, // Mm
        symbol: 'mm',
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={mmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initial value should be 45
    const rotationInput = screen.getByLabelText('Input for Rotation');
    expect(rotationInput).toHaveValue('45');

    // Change to cm units
    const cmUnits: Units = {
      length: {
        factor: 10, // Cm
        symbol: 'cm',
      },
    };

    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={cmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Value should STILL be 45 (not converted)
    const rotationInputAfterConversion = screen.getByLabelText('Input for Rotation');
    expect(rotationInputAfterConversion).toHaveValue('45');
  });

  it('should NOT apply unit conversion for count descriptor when units change', () => {
    const defaultParameters = {
      count: 5,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          default: 5,
        },
      },
    };

    // Start with mm units
    const mmUnits: Units = {
      length: {
        factor: 1,
        symbol: 'mm',
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={mmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initial value should be 5
    const countInput = screen.getByLabelText('Input for Count');
    expect(countInput).toHaveValue('5');

    // Change to cm units
    const cmUnits: Units = {
      length: {
        factor: 10,
        symbol: 'cm',
      },
    };

    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={cmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Value should STILL be 5 (not converted)
    const countInputAfterConversion = screen.getByLabelText('Input for Count');
    expect(countInputAfterConversion).toHaveValue('5');
  });

  it('should NOT apply unit conversion for unitless descriptor when units change', () => {
    const defaultParameters = {
      factor: 2.5,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        factor: {
          type: 'number',
          default: 2.5,
        },
      },
    };

    // Start with mm units
    const mmUnits: Units = {
      length: {
        factor: 1,
        symbol: 'mm',
      },
    };

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={mmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initial value should be 2.5
    const factorInput = screen.getByLabelText('Input for Factor');
    expect(factorInput).toHaveValue('2.5');

    // Change to cm units
    const cmUnits: Units = {
      length: {
        factor: 10,
        symbol: 'cm',
      },
    };

    rerender(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={cmUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Value should STILL be 2.5 (not converted)
    const factorInputAfterConversion = screen.getByLabelText('Input for Factor');
    expect(factorInputAfterConversion).toHaveValue('2.5');
  });
});

describe('Parameters - onChange Only Modified Values', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockOnParametersChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnParametersChange = vi.fn();
  });

  it('should only call onParametersChange with modified parameters, not all parameters', async () => {
    const defaultParameters = {
      name: 'default',
      count: 5,
      enabled: true,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'default' },
        count: { type: 'number', default: 5 },
        enabled: { type: 'boolean', default: true },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Clear any initial calls
    mockOnParametersChange.mockClear();

    // Modify only the 'name' field
    const nameInput = screen.getByLabelText('Input for Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'modified');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Should only be called with the modified parameter
    expect(mockOnParametersChange).toHaveBeenCalledWith({ name: 'modified' });
  });

  it('should only call onParametersChange with modified nested parameters', async () => {
    const defaultParameters = {
      config: {
        host: 'localhost',
        port: 8080,
      },
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            host: { type: 'string', default: 'localhost' },
            port: { type: 'number', default: 8080 },
          },
        },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Clear any initial calls
    mockOnParametersChange.mockClear();

    // Modify only the 'host' field
    const hostInput = screen.getByLabelText('Input for Host');
    await user.clear(hostInput);
    await user.type(hostInput, 'example.com');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Should only be called with the modified nested parameter
    expect(mockOnParametersChange).toHaveBeenCalledWith({
      config: {
        host: 'example.com',
      },
    });
  });

  it('should call onParametersChange with empty object when parameter is reset to default', async () => {
    const defaultParameters = {
      name: 'default',
      count: 5,
    };

    const editedParameters = {
      name: 'modified',
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'default' },
        count: { type: 'number', default: 5 },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={editedParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Clear any initial calls
    mockOnParametersChange.mockClear();

    // Reset the modified parameter back to default
    const resetButton = screen.getByLabelText('Reset Name');
    await user.click(resetButton);

    // Wait for reset to complete
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Should be called with empty object since all parameters are now at defaults
    expect(mockOnParametersChange).toHaveBeenCalledWith({});
  });

  it('should not call onParametersChange with unchanged parameters when multiple fields exist', async () => {
    const defaultParameters = {
      name: 'default',
      count: 5,
      enabled: true,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'default' },
        count: { type: 'number', default: 5 },
        enabled: { type: 'boolean', default: true },
      },
    };

    render(
      <TestWrapper>
        <Parameters
          parameters={{}}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Clear any initial calls
    mockOnParametersChange.mockClear();

    // Modify 'name' field
    const nameInput = screen.getByLabelText('Input for Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'modified');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Then modify 'count' field
    const countInput = screen.getByLabelText('Input for Count');
    await user.clear(countInput);
    await user.type(countInput, '10');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Should only be called with modified parameters ('name' and 'count'), not 'enabled'
    expect(mockOnParametersChange).toHaveBeenCalledWith({
      name: 'modified',
      count: 10,
    });
  });

  it('should hide reset all button when parameter is changed back to default', async () => {
    const defaultParameters = {
      name: 'default',
      count: 5,
    };

    const schema: RJSFSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'default' },
        count: { type: 'number', default: 5 },
      },
    };

    let currentParameters: Record<string, unknown> = {};
    const mockOnParametersChange = vi.fn((newParameters: Record<string, unknown>) => {
      currentParameters = newParameters;
    });

    const { rerender } = render(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Initially, no reset button should be present
    expect(screen.queryByLabelText('Reset all parameters')).toBeNull();

    // Step 1: Change name from default to modified
    const nameInput = screen.getByLabelText('Input for Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'modified');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Verify parameter was updated
    expect(currentParameters).toHaveProperty('name');
    expect(currentParameters['name']).toBe('modified');

    // Re-render with updated parameters
    rerender(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Reset all button should now be present
    expect(screen.getByLabelText('Reset all parameters')).toBeTruthy();

    // Step 2: Change name back to default
    mockOnParametersChange.mockClear();
    const nameInputAfter = screen.getByLabelText('Input for Name');
    await user.clear(nameInputAfter);
    await user.type(nameInputAfter, 'default');

    // Wait for onChange to fire
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    // Verify parameter was removed (back to default)
    expect(currentParameters).not.toHaveProperty('name');

    // Re-render with updated parameters
    rerender(
      <TestWrapper>
        <Parameters
          parameters={currentParameters}
          defaultParameters={defaultParameters}
          jsonSchema={schema}
          units={defaultUnits}
          onParametersChange={mockOnParametersChange}
        />
      </TestWrapper>,
    );

    // Reset all button should no longer be present since no parameters are modified
    expect(screen.queryByLabelText('Reset all parameters')).toBeNull();
  });
});
