import { TConditionNode, TColumnOperation } from 'pa-typings';

export function joinConditions(op: TColumnOperation, conditions: TConditionNode[]): TConditionNode {
  if (conditions.length === 0) {
    return {};
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return {
    op,
    children: conditions
  };
}

export function joinAnd(conditions: TConditionNode[]): TConditionNode {
  return joinConditions(TColumnOperation.co_AND, conditions);
}

export function joinOr(conditions: TConditionNode[]): TConditionNode {
  return joinConditions(TColumnOperation.co_OR, conditions);
}

export function hasTextId(type?: string): boolean {
  return (
    type === 'String' ||
    type === 'Text' ||
    type === 'ID'
  );
}

export function hasGeo(type?: string): boolean {
  return type === 'Geo';
}

function hasNumID(type?: string) {
  return type === 'NumID';
}

function hasUUID(type?: string) {
  return type === 'UUID';
}

function isObject(value: unknown): value is object {
  return value instanceof Object || {}.toString.call(value) === '[object Object]';
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevation: number;
}

export function isGeoPoint(arg: unknown): arg is GeoPoint {
  return isObject(arg) && 'latitude' in arg && 'longitude' in arg && 'elevation' in arg;
}

const paNaN = 1e100;
function isPaNaN(val: number): boolean {
  return val === null || val === paNaN;
}

function isNonNullable<T>(arg: T): arg is NonNullable<T> {
  return arg != null;
}

export function geoToString(value: GeoPoint, stringify = (v: number) => String(v)) {
  const { latitude, longitude, elevation } = value;
  const isNonEmpty = (v?: number) => isNonNullable(v) && !isPaNaN(v);

  if ([latitude, longitude, elevation].every(v => !isNonEmpty(v))) {
    return '';
  }

  return `{${[latitude, longitude, elevation].filter(isNonEmpty).map(stringify).join('; ')}}`;
}

export function getTConditionValue(value: unknown, type?: string) {
  return hasTextId(type) || hasNumID(type) || hasUUID(type) || hasGeo(type)
    ? { val: String(value) }
    : { dVal: Number(value) } satisfies TConditionNode;
}

const BASE_DATE = Date.UTC(1899, 11, 30);
const S_PER_DAY = 24 * 3600;
const MS_PER_DAY = S_PER_DAY * 1000;
export function variantToDate(daysAfterBaseDate: number, dateOnly?: boolean): Date {
  const ms = dateOnly ? MS_PER_DAY * Math.trunc(daysAfterBaseDate) : Math.round(MS_PER_DAY * daysAfterBaseDate);
  return new Date(BASE_DATE + ms);
}

interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

export function getDurationAsStruct(value?: number): Duration {
  if (value == undefined)
    return {};
  const days = Math.trunc(value);
  const leftMs = Math.round((value - days) * MS_PER_DAY);
  const leftSeconds = Math.trunc(leftMs / 1000);
  const leftMinutes = Math.trunc(leftSeconds / 60);
  return {
    days,
    hours: Math.trunc(leftMinutes / 60),
    minutes: leftMinutes % 60,
    seconds: leftSeconds % 60,
    milliseconds: leftMs % 1000
  };
}
