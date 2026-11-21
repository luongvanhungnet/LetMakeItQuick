"use strict";

const zipCRC = Uint32Array.from({length:256},(_,index)=>{
  let value = index;
  for (let bit=0;bit<8;bit++) value = value & 1 ? (value >>> 1)^0xedb88320 : value >>> 1;
  return value;
});

async function createReleaseZip(files) {
  const encoder = new TextEncoder(), records = [], directory = [];
  const list = Object.entries(files);
  let offset = 0, directorySize = 0;
  if (list.length > 65535) throw new RangeError("Too many files for this ZIP archive.");
  for (const [path,file] of list) {
    if (path.split("/").some(part=>!part || part==="." || part==="..") || /[\\\u0000-\u001f]/.test(path)) {
      throw new Error("Invalid ZIP file path.");
    }
    const name = encoder.encode(path);
    const data = typeof file === "string" ? encoder.encode(file)
      : file instanceof Uint8Array ? file
      : new Uint8Array(await file.arrayBuffer());
    if (name.length > 65535 || data.length >= 0xffffffff) throw new RangeError("A ZIP entry is too large.");
    let crc = 0xffffffff;
    for (const byte of data) crc = zipCRC[(crc^byte)&255]^(crc>>>8);
    crc = (crc^0xffffffff)>>>0;
    const header = new Uint8Array(30+name.length);
    const local = new DataView(header.buffer);
    local.setUint32(0,0x04034b50,true);
    local.setUint16(4,20,true);
    local.setUint16(6,0x800,true);
    local.setUint16(12,33,true);
    local.setUint32(14,crc,true);
    local.setUint32(18,data.length,true);
    local.setUint32(22,data.length,true);
    local.setUint16(26,name.length,true);
    header.set(name,30);
    const entry = new Uint8Array(46+name.length);
    const central = new DataView(entry.buffer);
    central.setUint32(0,0x02014b50,true);
    central.setUint16(4,20,true);
    central.setUint16(6,20,true);
    central.setUint16(8,0x800,true);
    central.setUint16(14,33,true);
    central.setUint32(16,crc,true);
    central.setUint32(20,data.length,true);
    central.setUint32(24,data.length,true);
    central.setUint16(28,name.length,true);
    central.setUint32(42,offset,true);
    entry.set(name,46);
    records.push(header,data);
    directory.push(entry);
    offset += header.length+data.length;
    directorySize += entry.length;
    if (offset+directorySize >= 0xffffffff) throw new RangeError("The ZIP archive is too large.");
  }
  const ending = new Uint8Array(22);
  const end = new DataView(ending.buffer);
  end.setUint32(0,0x06054b50,true);
  end.setUint16(8,list.length,true);
  end.setUint16(10,list.length,true);
  end.setUint32(12,directorySize,true);
  end.setUint32(16,offset,true);
  return new Blob([...records,...directory,ending],{type:"application/zip"});
}
