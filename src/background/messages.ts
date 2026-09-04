import type { ExtensionMessage } from '../platforms/common';
import {
  type ClaimMap,
  type ClaimValue,
  type DirectorySubscription,
  type ServerConfig,
  type Settings,
} from '../core/common/types';

type AuthorKeyType = 'HUMAN' | 'AI' | 'HUMAN_AI_MIX' | 'ORGANIZATION';
type ServerUpdates = Partial<Omit<ServerConfig, 'id'>>;

export type PopupMessage =
  | { type: 'SIGN_CONTENT'; url: string; claims?: ClaimMap }
  | { type: 'CREATE_AUTHOR'; name: string; keyType: AuthorKeyType; description?: string; url?: string }
  | { type: 'ASSOCIATE_API_KEY'; authorId: string; apiKey: string }
  | { type: 'SIGN_OUT' }
  | { type: 'GET_ACTIVE_SERVER' }
  | { type: 'SET_ACTIVE_SERVER'; serverId: string }
  | { type: 'GET_ALL_SERVERS' }
  | { type: 'ADD_SERVER'; name: string; url: string; setAsActive?: boolean }
  | { type: 'UPDATE_SERVER'; id: string; updates: ServerUpdates }
  | { type: 'REMOVE_SERVER'; id: string };

export type ContentMessage =
  | { type: 'CONTENT_DETECTED'; url: string; verified?: boolean };

export type OptionsMessage = { type: 'UPDATE_SETTINGS'; settings: Settings };

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(
  message: ExtensionMessage | Record<string, unknown>,
  field: string,
  label = field,
): string {
  const value = message[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(message: Record<string, unknown>, field: string): string | undefined {
  const value = message[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  return value;
}

function optionalBoolean(message: Record<string, unknown>, field: string): boolean | undefined {
  const value = message[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be a boolean`);
  return value;
}

function booleanField(message: Record<string, unknown>, field: string): boolean {
  const value = message[field];
  if (typeof value !== 'boolean') throw new TypeError(`settings.${field} must be a boolean`);
  return value;
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${field} must be an array of strings`);
  }
  return [...value];
}

function claimMap(value: unknown): ClaimMap | undefined {
  if (value === undefined || value === null) return undefined;
  const claims = record(value, 'claims');
  for (const [name, claim] of Object.entries(claims)) {
    const scalar = typeof claim === 'string' || typeof claim === 'boolean' ||
      (typeof claim === 'number' && Number.isFinite(claim));
    if (!scalar) throw new TypeError(`claim ${name} must be a JSON scalar`);
  }
  return claims as Record<string, ClaimValue>;
}

function serverConfig(value: unknown, field: string): ServerConfig {
  const config = record(value, field);
  const result: ServerConfig = {
    id: stringField(config, 'id', `${field}.id`),
    name: stringField(config, 'name', `${field}.name`),
    url: stringField(config, 'url', `${field}.url`),
    isActive: config.isActive === true,
  };
  if (config.isActive !== true && config.isActive !== false) {
    throw new TypeError(`${field}.isActive must be a boolean`);
  }
  result.authorApiKey = optionalString(config, 'authorApiKey');
  result.authorId = optionalString(config, 'authorId');
  result.generalApiKey = optionalString(config, 'generalApiKey');
  return result;
}

function serverUpdates(value: unknown): ServerUpdates {
  const updates = record(value, 'updates');
  const result: ServerUpdates = {};
  if ('name' in updates) result.name = optionalString(updates, 'name');
  if ('url' in updates) result.url = optionalString(updates, 'url');
  if ('authorApiKey' in updates) result.authorApiKey = optionalString(updates, 'authorApiKey');
  if ('authorId' in updates) result.authorId = optionalString(updates, 'authorId');
  if ('generalApiKey' in updates) result.generalApiKey = optionalString(updates, 'generalApiKey');
  if ('isActive' in updates) result.isActive = optionalBoolean(updates, 'isActive');
  return result;
}

function subscriptions(value: unknown): DirectorySubscription[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError('trustDirectorySubscriptions must be an array');
  return value.map((item, index) => {
    const subscription = record(item, `trustDirectorySubscriptions[${index}]`);
    const url = stringField(subscription, 'url', `trustDirectorySubscriptions[${index}].url`);
    if (typeof subscription.weight !== 'number' || !Number.isFinite(subscription.weight)) {
      throw new TypeError(`trustDirectorySubscriptions[${index}].weight must be a finite number`);
    }
    if (typeof subscription.enabled !== 'boolean') {
      throw new TypeError(`trustDirectorySubscriptions[${index}].enabled must be a boolean`);
    }
    return { url, weight: subscription.weight, enabled: subscription.enabled };
  });
}

function settings(value: unknown): Settings {
  const input = record(value, 'settings');
  const authMethod = input.authMethod;
  if (authMethod !== 'apikey' && authMethod !== 'webauthn' && authMethod !== 'password') {
    throw new TypeError('settings.authMethod is invalid');
  }
  if (!Array.isArray(input.serverConfigs)) throw new TypeError('settings.serverConfigs must be an array');
  const result: Settings = {
    autoVerify: booleanField(input, 'autoVerify'),
    showBadges: booleanField(input, 'showBadges'),
    highlightVerified: booleanField(input, 'highlightVerified'),
    highlightUnverified: booleanField(input, 'highlightUnverified'),
    authMethod,
    serverConfigs: input.serverConfigs.map((item, index) => serverConfig(item, `settings.serverConfigs[${index}]`)),
  };
  result.trustDirectoryUrl = optionalString(input, 'trustDirectoryUrl');
  result.trustDirectoryUrls = stringArray(input.trustDirectoryUrls, 'settings.trustDirectoryUrls');
  result.trustDirectorySubscriptions = subscriptions(input.trustDirectorySubscriptions);
  result.personalTrustList = stringArray(input.personalTrustList, 'settings.personalTrustList');
  result.trustedDomains = stringArray(input.trustedDomains, 'settings.trustedDomains');
  result.activeServerId = optionalString(input, 'activeServerId');
  result.developerDebugLogging = optionalBoolean(input, 'developerDebugLogging');
  return result;
}

export function parsePopupMessage(message: ExtensionMessage): PopupMessage {
  switch (message.type) {
    case 'SIGN_CONTENT':
      return { type: message.type, url: stringField(message, 'url'), claims: claimMap(message.claims) };
    case 'CREATE_AUTHOR': {
      const keyType = message.keyType;
      if (keyType !== 'HUMAN' && keyType !== 'AI' && keyType !== 'HUMAN_AI_MIX' && keyType !== 'ORGANIZATION') {
        throw new TypeError('keyType is invalid');
      }
      return {
        type: message.type,
        name: stringField(message, 'name'),
        keyType,
        description: optionalString(message, 'description'),
        url: optionalString(message, 'url'),
      };
    }
    case 'ASSOCIATE_API_KEY':
      return {
        type: message.type,
        authorId: stringField(message, 'authorId'),
        apiKey: stringField(message, 'apiKey'),
      };
    case 'SIGN_OUT':
    case 'GET_ACTIVE_SERVER':
    case 'GET_ALL_SERVERS':
      return { type: message.type };
    case 'SET_ACTIVE_SERVER':
      return { type: message.type, serverId: stringField(message, 'serverId') };
    case 'ADD_SERVER':
      return {
        type: message.type,
        name: stringField(message, 'name'),
        url: stringField(message, 'url'),
        setAsActive: optionalBoolean(message, 'setAsActive'),
      };
    case 'UPDATE_SERVER':
      return { type: message.type, id: stringField(message, 'id'), updates: serverUpdates(message.updates) };
    case 'REMOVE_SERVER':
      return { type: message.type, id: stringField(message, 'id') };
    default:
      throw new TypeError(`Unknown popup message type: ${message.type}`);
  }
}

export function parseContentMessage(message: ExtensionMessage): ContentMessage {
  switch (message.type) {
    case 'CONTENT_DETECTED':
      return {
        type: message.type,
        url: stringField(message, 'url'),
        verified: optionalBoolean(message, 'verified'),
      };
    default:
      throw new TypeError(`Unknown content message type: ${message.type}`);
  }
}

export function parseOptionsMessage(message: ExtensionMessage): OptionsMessage {
  if (message.type !== 'UPDATE_SETTINGS') {
    throw new TypeError(`Unknown options message type: ${message.type}`);
  }
  return { type: message.type, settings: settings(message.settings) };
}
