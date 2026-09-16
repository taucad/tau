import { requiredExport } from '@fixture/missing-export';
import { createBridge } from '@fixture/missing-subpath/bridge';
import { publicEntry } from '@fixture/private-transitive';

void createBridge;
void publicEntry;
void requiredExport;
