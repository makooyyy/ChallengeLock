// Safe localStorage wrapper: never throws (private mode, quota, corrupt JSON).
import {normalizeState} from './validation.js';
const K='dlr.v1';
export function load(def){try{return normalizeState(JSON.parse(localStorage.getItem(K)||'{}'),def)}catch(e){console.warn('storage load',e);return normalizeState({},def)}}
export function save(obj){try{localStorage.setItem(K,JSON.stringify(obj));return true}catch(e){console.warn('storage save',e);return false}}

