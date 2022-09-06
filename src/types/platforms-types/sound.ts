import _ from 'lodash';

import { extractHashFromURL } from '../../clients/ipfs';
import { slugify } from '../../utils/identifiers';
import { formatAddress } from '../address';
import { ArtistProfile } from '../artist';
import { NFT, getNFTMetadataField } from '../nft';
import { MapNFTsToTrackIds, MapTrack } from '../processor';

const mapAPITrackToArtistID = (apiTrack: any): string => {
  return `ethereum/${formatAddress(apiTrack.artist.user.publicAddress)}`;
};

const mapTrack: MapTrack = (
  nft,
  apiTrack
) => {
  if (!apiTrack) {
    throw new Error('missing api track');
  }
  if (!apiTrack.tracks[0].audio) {
    throw new Error('missing nft metadata audio_url');
  }
  return ({
    id: apiTrack.trackId,
    platformInternalId: apiTrack.id,
    title: apiTrack.title,
    slug: slugify(`${apiTrack.title} ${nft.createdAtTime.getTime()}`),
    description: apiTrack.description,
    platformId: nft.platformId,
    lossyAudioURL: apiTrack.tracks[0].audio.url || nft.metadata.audio_url,
    lossyArtworkURL: apiTrack.coverImage.url,
    lossyAudioIPFSHash: extractHashFromURL(getNFTMetadataField(nft, 'animation_url'))!,
    lossyArtworkIPFSHash: extractHashFromURL(getNFTMetadataField(nft, 'image'))!,
    createdAtTime: nft.createdAtTime,
    createdAtEthereumBlockNumber: nft.createdAtEthereumBlockNumber,
    websiteUrl:
      apiTrack.artist.soundHandle && apiTrack.titleSlug
        ? `https://www.sound.xyz/${apiTrack.artist.soundHandle}/${apiTrack.titleSlug}`
        : 'https://www.sound.xyz',
    artistId: mapAPITrackToArtistID(apiTrack),
  })
};

const mapArtistProfile = ({ apiTrack, nft }: { apiTrack: any, nft?: NFT }): ArtistProfile => {
  if (!apiTrack) {
    throw new Error('missing api track');
  }
  const artist = apiTrack.artist
  return {
    name: artist.name,
    artistId: mapAPITrackToArtistID(apiTrack),
    platformInternalId: artist.id,
    platformId: nft!.platformId,
    avatarUrl: artist.user.avatar.url,
    websiteUrl: artist.soundHandle ?
      `https://www.sound.xyz/${artist.soundHandle}`
      : 'https://www.sound.xyz',
    createdAtTime: nft!.createdAtTime,
    createdAtEthereumBlockNumber: nft!.createdAtEthereumBlockNumber
  }
};

const mapNFTsToTrackIds: MapNFTsToTrackIds = (nfts, dbClient?, apiTracksByNFT?) => {
  if (!apiTracksByNFT) {
    throw new Error('Expecting apiTracksByNFT for sound mapper');
  }
  return _.groupBy(nfts, nft => apiTracksByNFT[nft.id]);
}

export default {
  mapNFTsToTrackIds,
  mapTrack,
  mapArtistProfile
}
