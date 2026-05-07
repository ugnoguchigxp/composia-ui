import { componentDefinitions } from '../services/catalog.service';

export const componentRegistryRepository = {
  listComponents: async () => componentDefinitions,
  getComponent: async (name: string) =>
    componentDefinitions.find((definition) => definition.name === name) ?? null,
};
