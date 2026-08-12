import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "reservas.core.access-token";

export function loadAccessToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export function saveAccessToken(token: string) {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export function clearAccessToken() {
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}
