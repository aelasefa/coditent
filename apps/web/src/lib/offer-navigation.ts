export function getOfferDiscoverPath(offerId: string): string {
  return `/dashboard/recommendations?offer=${encodeURIComponent(offerId)}`;
}

export function getOfferLoginPath(offerId: string): string {
  return `/login?next=${encodeURIComponent(getOfferDiscoverPath(offerId))}`;
}
