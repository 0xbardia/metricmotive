/** B-11: when no wallet is connected, open the connect modal AND fail with `message`. */
export function requireWallet<A extends string, C>(
  wallet: { address?: A | null; connector?: C | null },
  connect: () => void,
  message: string,
): { address: A; connector: C } {
  const { address, connector } = wallet;
  if (!address || !connector) {
    connect();
    throw new Error(message);
  }
  return { address, connector };
}
