export function zipItems(buffer) {
  const items = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const length = buffer.readUInt32LE(offset+18);
    const nameLength = buffer.readUInt16LE(offset+26);
    const extra = buffer.readUInt16LE(offset+28);
    const name = buffer.subarray(offset+30,offset+30+nameLength).toString("utf8");
    const start = offset+30+nameLength+extra;
    items.set(name,buffer.subarray(start,start+length));
    offset = start+length;
  }
  return items;
}
