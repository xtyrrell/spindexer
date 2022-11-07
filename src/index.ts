import 'dotenv/config';
import './types/env';

import _ from 'lodash';

import { Table } from './db/db';
import db from './db/sql-db';
import { addMetadataIPFSHashProcessor } from './processors/default/addMetadataIPFSHash';
import { addMetadataObjectProcessor } from './processors/default/addMetadataObject';
import { addTimestampToERC721NFTs, addTimestampToERC721Transfers } from './processors/default/addTimestampToERC721NFTs';
import { createERC721NFTsFromTransfersProcessor } from './processors/default/createERC721NFTsFromTransfersProcessor';
import { createNftFactoryFromERC721MetaFactoryProcessor } from './processors/default/createNftFactoryFromERC721MetaFactory';
import { createNftsFromCandyMachine } from './processors/default/createNftFromCandyMachine';
import { createProcessedTracksFromAPI } from './processors/default/createProcessedTracksFromAPI';
import { errorAndMetadataResetProcessor, errorProcessor } from './processors/default/errorProcessor';
import { getERC721ContractFieldsProcessor } from './processors/default/getERC721ContractFieldsProcessor';
import { getERC721TokenFieldsProcessor } from './processors/default/getERC721TokenFieldsProcessor';
import { insertSeedsIntoMempool } from './processors/default/insertSeedsIntoMempool';
import { ipfsAudioUploader, ipfsArtworkUploader } from './processors/default/ipfsMediaUploader';
import { ipfsAudioPinner, ipfsArtworkPinner } from './processors/default/ipfsPinner';
import { processMempoolInserts, processMempoolUpdates } from './processors/default/processMempool';
import { processPlatformTracks } from './processors/default/processPlatformTracks/processPlatformTracks';
import { runProcessors } from './runner';
import { ChainId } from './types/chain';
import { MetaFactory, MetaFactoryTypeName } from './types/metaFactory';
import { NftFactory, NFTStandard } from './types/nft';
import { API_PLATFORMS, MusicPlatform } from './types/platform';

const PROCESSORS = (
  nftFactories: NftFactory[],
  erc721MetaFactories: MetaFactory[],
  musicPlatforms: MusicPlatform[],
  candyMachines: MetaFactory[]
) => {
  const nftFactoriesByAddress = _.keyBy(nftFactories, 'id');

  const erc721MetaFactoryProcessors = erc721MetaFactories.map(contract => createNftFactoryFromERC721MetaFactoryProcessor(contract));

  const erc721ContractFieldProcessors = Object.values(ChainId).map(chainId => getERC721ContractFieldsProcessor(chainId as any))
  // TODO: make scalable - maybe move contracts query to trigger like for the above processor
  const erc721TransferProcessors = Object.values(ChainId).map(chainId => createERC721NFTsFromTransfersProcessor(chainId, nftFactories.filter(factory => factory.chainId === chainId)));
  const addTimestampToERC721TransfersProcessors = Object.values(ChainId).map(chainId => addTimestampToERC721Transfers(chainId))
  const addTimestampToERC721NftsProcessors = Object.values(ChainId).map(chainId => addTimestampToERC721NFTs(chainId))

  // TODO: improve filtering / grouping
  const getERC721TokenFieldsProcessors = Object.values(ChainId).map(chainId => getERC721TokenFieldsProcessor(
    chainId,
    _.keyBy(nftFactories.filter(factory => factory.chainId === chainId), 'id')
  ))

  const platformTrackProcessors = musicPlatforms.map(musicPlatform => processPlatformTracks(musicPlatform));

  //TODO: noizd here is being used both as platformId and MusicPlatformType. Need to avoid mixing them
  const apiTrackProcessors = API_PLATFORMS.map(apiPlatform => createProcessedTracksFromAPI(apiPlatform));

  const crdtTables = [Table.platforms, Table.metaFactories, Table.nftFactories, Table.nfts, Table.artists, Table.processedTracks];

  const tableInsertsMempoolProcessors = crdtTables.map(table => processMempoolInserts(table));
  const tableUpdatesMempoolProcessors = crdtTables.map(table => processMempoolUpdates(table));

  const candyMachineProcessors = candyMachines.map(candyMachine => createNftsFromCandyMachine(candyMachine))

  return [
    insertSeedsIntoMempool,
    errorAndMetadataResetProcessor,
    ...tableInsertsMempoolProcessors,
    ...tableUpdatesMempoolProcessors,
    ...erc721MetaFactoryProcessors,
    // ...candyMachineProcessors,
    ...erc721ContractFieldProcessors,
    ...erc721TransferProcessors,
    ...addTimestampToERC721TransfersProcessors,
    ...addTimestampToERC721NftsProcessors,
    ...getERC721TokenFieldsProcessors,
    addMetadataIPFSHashProcessor(nftFactoriesByAddress),
    addMetadataObjectProcessor(nftFactoriesByAddress),
    // categorizeZora,
    // createNinaNfts,
    // addTimestampFromMetadata,
    // ...platformTrackProcessors,
    // ...apiTrackProcessors,
    ipfsAudioUploader,
    ipfsArtworkUploader,
    ipfsAudioPinner,
    ipfsArtworkPinner,
    errorProcessor,
  ]
};

const updateDBLoop = async () => {
  const dbClient = await db.init();
  const nftFactories = await dbClient.getRecords<NftFactory>(Table.nftFactories);
  
  const metafactories = await dbClient.getRecords<MetaFactory>(Table.metaFactories);
  const erc721MetaFactories = metafactories.filter(metaFactory => metaFactory.standard === NFTStandard.ERC721);
  const candyMachines = metafactories.filter(metaFactory => metaFactory.standard === NFTStandard.METAPLEX && metaFactory.contractType === MetaFactoryTypeName.candyMachine) 

  const musicPlatforms = await dbClient.getRecords<MusicPlatform>(Table.platforms);
  await runProcessors(PROCESSORS(nftFactories, erc721MetaFactories, musicPlatforms, candyMachines), dbClient);
};

process.on('SIGINT', () => {
  console.log('Exiting...');
  setTimeout(() => process.exit(), 0);
});

updateDBLoop();
