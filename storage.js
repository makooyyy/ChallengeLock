// Safe localStorage wrapper: never throws (private mode, quota, corrupt JSON).
const K='dlr.v1';
export function load(def){try{return{...def,...JSON.parse(localStorage.getItem(K)||'{}')}}catch(e){console.warn('storage load',e);return def}}
export function save(obj){try{localStorage.setItem(K,JSON.stringify(obj));return true}catch(e){console.warn('storage save',e);return false}}
