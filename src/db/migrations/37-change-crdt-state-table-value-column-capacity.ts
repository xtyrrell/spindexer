import { Knex } from 'knex';

import { Table } from '../db';
import { tableNameToViewName, updateViews } from '../migration-helpers';
import { overridesV1 } from '../views';

export const up = async (knex: Knex) => {
  await knex.schema.dropView(tableNameToViewName(Table.crdtState));
  await knex.schema.alterTable(Table.crdtState, table => {
    table.string('value', 20000).alter();
  })
  await updateViews(knex, overridesV1);
}

export const down = async (knex: Knex) => {
  await knex.schema.dropViewIfExists(tableNameToViewName(Table.crdtState));
  await knex.schema.alterTable(Table.crdtState, table => {
    table.string('value', 255).alter();
  })
  await updateViews(knex, overridesV1);
}
