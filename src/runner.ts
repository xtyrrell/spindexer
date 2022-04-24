import axios from './clients/axios';
import catalog from './clients/catalog';
import ethereum from './clients/ethereum';
import ipfs from './clients/ipfs';
import noizd from './clients/noizd';
import sound from './clients/sound';
import { DBClient } from './db/db';
import { Clients, Processor } from './types/processor';

export const runProcessors = async (processors: Processor[], dbClient: DBClient) => {
  const ethClient = await ethereum.init();
  const axiosClient = await axios.init();
  const ipfsClient = await ipfs.init();
  const catalogClient = await catalog.init();
  const soundClient = await sound.init();
  const noizdClient = await noizd.init();

  const clients: Clients = {
    eth: ethClient,
    db: dbClient,
    axios: axiosClient,
    ipfs: ipfsClient,
    catalog: catalogClient,
    sound: soundClient,
    noizd: noizdClient
  };

  // This runs each processor until completion serially. We could consider
  // alternate orders or parallelization in future or allow for explicit
  // control over the order to be set, for example if there are dependencies
  // between processors.
  for (const processor of processors) {
    let processingComplete = false;
    while (!processingComplete) {
      processingComplete = await runProcessor(processor, clients);
    }
  }

  const numberOfNFTs = await dbClient.getNumberRecords('nfts');
  const numberOfMetadatas = await dbClient.getNumberRecords('metadatas');
  const numberOfProcessedTracks = await dbClient.getNumberRecords('processedTracks');
  console.info(`DB has ${numberOfNFTs} nfts`);
  console.info(`DB has ${numberOfMetadatas} metadatas`);
  console.info(`DB has ${numberOfProcessedTracks} processed tracks`);
  await dbClient.close();
  return false;
};

const runProcessor = async (processor: Processor, clients: Clients) => {
  const cursor = await clients.db.getCursor(processor.name) || processor.initialCursor;
  const triggerOutput = await processor.trigger(clients, cursor);
  if (Array.isArray(triggerOutput) && triggerOutput.length === 0) {
    return true;
  }
  console.info(`Running ${processor.name} processor.`)
  await processor.processorFunction(triggerOutput, clients);
  return false;
}
