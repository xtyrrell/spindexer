import { JsonMetadata, Metadata } from '@metaplex-foundation/js'
import { ethers } from 'ethers'

import { ethereumId } from '../utils/identifiers'

import { formatAddress } from './address'
import { Contract } from './contract'
import { ArtistIdExtractorTypes, ArtistNameExtractorTypes, AvatarUrlExtractorTypes, IdExtractorTypes, TitleExtractorTypes, WebsiteUrlExtractorTypes } from './fieldExtractor'
import { NftFactory, NFTContractTypeName, NFTStandard, TypeMetadata } from './nft'
import { MusicPlatformType } from './platform'
import { Clients } from './processor'

export enum MetaFactoryTypeName {
  soundArtistProfileCreator = 'soundArtistProfileCreator',
  ninaMintCreator = 'ninaMintCreator',
  zoraDropCreator = 'zoraDropCreator',
  candyMachine = 'candyMachine',
  soundCreatorV1 = 'soundCreatorV1',
  decent = 'decent',
  lens = 'lens'
}

export type MetaFactory = Contract & {
  platformId: string,
  contractType: MetaFactoryTypeName,
  gap?: string
  standard: NFTStandard; // which type of factories will this metaFactory create
  autoApprove: boolean;
  typeMetadata?: TypeMetadata;
}

export type MetaFactoryType = {
  newContractCreatedEvent?: string,
  creationMetadataToNftFactory: (creationData: any, autoApprove: boolean, factoryMetadata?: any) => NftFactory
  metadataAPI?: (events: ethers.Event[], clients: Clients) => Promise<any>,
}

type MetaFactoryTypes = {
  [type in MetaFactoryTypeName]?: MetaFactoryType
}

function candyMachineArtistId(metadataAccount: Metadata<JsonMetadata<string>>): string {
  const artist = metadataAccount.creators.find(creator => creator.verified === true);

  if (!artist){
    throw `Can't find artist address for ${metadataAccount.address.toBase58()}`
  }

  return artist.address.toBase58();
}

export const MetaFactoryTypes: MetaFactoryTypes = {
  soundArtistProfileCreator: {
    newContractCreatedEvent: 'CreatedArtist',
    creationMetadataToNftFactory: (event: any, autoApprove: boolean) => ({
      id: formatAddress(event.args!.artistAddress),
      platformId: 'sound',
      startingBlock: event.blockNumber,
      contractType: NFTContractTypeName.default,
      standard: NFTStandard.ERC721,
      autoApprove,
      approved: autoApprove
    })
  },
  zoraDropCreator: {
    newContractCreatedEvent: 'CreatedDrop',
    creationMetadataToNftFactory: (event: any, autoApprove: boolean) => ({
      id: formatAddress(event.args!.editionContractAddress),
      platformId: 'zora',
      startingBlock: event.blockNumber,
      contractType: NFTContractTypeName.default,
      standard: NFTStandard.ERC721,
      autoApprove,
      approved: autoApprove,
      typeMetadata: {
        overrides: {
          artist: {
            artistId: ethereumId(event.args!.creator),
            name: formatAddress(event.args!.creator),
          },
          track: {
            websiteUrl: `https://create.zora.co/editions/${formatAddress(event.args!.editionContractAddress)}`
          }
        }
      }
    })
  },
  soundCreatorV1: {
    newContractCreatedEvent: 'SoundEditionCreated',
    metadataAPI: async (events, clients: Clients) => {
      const editionAddresses = new Set(events.map(event => formatAddress(event.args!.soundEdition)));
      let soundPublicTimes: any;
      try {
        soundPublicTimes = await clients.sound.fetchPublicTimes([...editionAddresses]);
      } catch {
        // If API Fails/is down, assume it's official and no presales
        return { officialEditions: new Set([...editionAddresses]), soundPublicTimes: {} };
      }
      const publicAddresses = new Set(Object.keys(soundPublicTimes));
      const officialEditions = new Set([...editionAddresses].filter((address) => publicAddresses.has(address)));
      return { soundPublicTimes, officialEditions };
    },
    creationMetadataToNftFactory: (event: any, autoApprove: boolean, factoryMetadata: any) => {
      const official = factoryMetadata.officialEditions.has(formatAddress(event.args!.soundEdition));
      const publicReleaseTimeRaw = factoryMetadata.soundPublicTimes[formatAddress(event.args!.soundEdition)];
      const publicReleaseTime = publicReleaseTimeRaw ? new Date(publicReleaseTimeRaw) : undefined;
      return ({
        id: formatAddress(event.args!.soundEdition),
        platformId: official ? 'sound' : 'sound-protocol-v1',
        startingBlock: `${parseInt(event.blockNumber) - 1}`,
        contractType: NFTContractTypeName.default,
        standard: NFTStandard.ERC721,
        autoApprove: official,
        approved: official,
        typeMetadata: {
          other: {
            publicReleaseTime
          },
          overrides: {
            type: MusicPlatformType['multi-track-multiprint-contract'],
            artist: {
              artistId: ethereumId(event.args!.deployer),
            },
            extractor: {
              id: IdExtractorTypes.TRACK_NUMBER,
              title: TitleExtractorTypes.METADATA_TITLE,
              artistName: ArtistNameExtractorTypes.METADATA_ARTIST,
              avatarUrl: AvatarUrlExtractorTypes.METADATA_IMAGE,
              websiteUrl: WebsiteUrlExtractorTypes.METADATA_EXTERNAL_URL,
              artistWebsiteUrl: WebsiteUrlExtractorTypes.EXTERNAL_URL_WITH_ONLY_FIRST_SEGMENT
            }
          }
        }
      })}
  },
  candyMachine: {
    creationMetadataToNftFactory: ({ metadataAccount, metaFactory }: { metadataAccount: Metadata, metaFactory: MetaFactory }, autoApprove: boolean) => {
      return {
        id: metadataAccount.mintAddress.toBase58(),
        contractType: NFTContractTypeName.candyMachine,
        platformId: metaFactory.platformId,
        standard: NFTStandard.METAPLEX,
        name: metadataAccount.name,
        symbol: metadataAccount.symbol,
        autoApprove, 
        approved: autoApprove, 
        typeMetadata: {
          ...metaFactory.typeMetadata,
          overrides: {
            ...metaFactory.typeMetadata?.overrides,
            extractor: {
              id: {
                extractor: IdExtractorTypes.USE_METAFACTORY_AND_TITLE_EXTRACTOR,
                params: { 
                  metaFactoryId: metaFactory.id,
                }
              },
              ...metaFactory.typeMetadata?.overrides.extractor,
            },
            artist: {
              artistId: candyMachineArtistId(metadataAccount),
              ...metaFactory.typeMetadata?.overrides.artist,
            }
          }
        }
      }
    }
  },
  decent: {
    newContractCreatedEvent: 'DeployDCNT721A',
    metadataAPI: async (events, clients: Clients) => {
      if (events.length === 0){
        return 
      }

      const results = await Promise.all(
        events.map(async event => {
          const contractAddress = event!.args!.DCNT721A;
          const owner = await clients.eth.getContractOwner(contractAddress)
          return {
            contract: contractAddress,
            owner
          }
        })
      )

      return results
    },
    creationMetadataToNftFactory(event, autoApprove, factoryMetadata: { contract: string, owner: string }[]) {
      const apiMetadata = factoryMetadata.find(data => data.contract === event.args.DCNT721A)

      if (!apiMetadata){
        throw `Couldn't find owner for contract`;
      }

      const nftFactory: NftFactory = {
        approved: autoApprove,
        autoApprove,
        contractType: NFTContractTypeName.default,
        id: event.args.DCNT721A,
        platformId: 'decent',
        standard: NFTStandard.ERC721,
        startingBlock: `${parseInt(event.blockNumber) - 1}`,
        typeMetadata: {
          overrides: {
            artist: {
              artistId: apiMetadata.owner
            },
            extractor: {
              id: IdExtractorTypes.USE_TITLE_EXTRACTOR,
              title: TitleExtractorTypes.METADATA_NAME,
              artistId: ArtistIdExtractorTypes.USE_ARTIST_ID_OVERRIDE,
              artistName: ArtistNameExtractorTypes.METADATA_ARTIST
            }
          }
        }
      } 

      return nftFactory
    },
  },
  lens: {
    newContractCreatedEvent: 'CollectNFTDeployed',
    metadataAPI: async (events, clients) => {
      
      console.log('got events', events)

      if (!1){
        throw 'get metadata....'
      }

      return {}
    },
    creationMetadataToNftFactory(creationData, autoApprove, factoryMetadata?) {
      
      if (1){
        throw 'test create nft factory'
      }

      return {} as NftFactory;

    },
  }
}
