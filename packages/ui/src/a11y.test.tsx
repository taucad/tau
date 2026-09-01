import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { Button } from '#components/button.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '#components/dialog.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#components/dropdown-menu.js';
import { Input } from '#components/input.js';
import { Label } from '#components/label.js';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#components/table.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/tabs.js';

describe('accessibility smoke test', () => {
  it('has no automated violations across representative primitives', async () => {
    const { baseElement: container } = render(
      <main>
        <Button>Save model</Button>

        <Dialog open>
          <DialogTrigger>Open details</DialogTrigger>
          <DialogContent>
            <DialogTitle>Model details</DialogTitle>
            <DialogDescription>Inspect the selected model.</DialogDescription>
          </DialogContent>
        </Dialog>

        <DropdownMenu open>
          <DropdownMenuTrigger>Open actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tabs defaultValue='model'>
          <TabsList aria-label='Workspace panels'>
            <TabsTrigger value='model'>Model</TabsTrigger>
            <TabsTrigger value='code'>Code</TabsTrigger>
          </TabsList>
          <TabsContent value='model'>Model panel</TabsContent>
          <TabsContent value='code'>Code panel</TabsContent>
        </Tabs>

        <Label htmlFor='model-name'>Model name</Label>
        <Input id='model-name' />

        <Table>
          <TableCaption>Model parameters</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Height</TableCell>
              <TableCell>20 mm</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </main>,
    );

    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});
