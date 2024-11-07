import {getSignalMapKey} from "../encoding/spConfig";
import TestConfigService from "../../../app/service/TestConfig"
import {Buffer} from "buffer";
import {getCollectItemFromId} from "../encoding";
import {ProtocolType} from "../../../app/model/PreSet/Protocol.model";

export const splitBufferByDelimiter = (buffer: Buffer, delimiter: Buffer): Buffer[] => {
  let start = 0;
  const result: Buffer[] = [];
  let index = buffer.indexOf(delimiter);
  while (index !== -1) {
    if (start !== index) {
      result.push(buffer.subarray(start, index));
    }
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  result.push(buffer.subarray(start));
  result.forEach((item, index) => {
    result[index] = Buffer.concat([delimiter, item]);
  })
  return result;
}

export interface ITimeData {
  time: number,
  value: number
}

export interface IReceiveData {
  moduleId: number;
  collectType: number;
  busType: number;
  timestamp: number;
  frameId: number;
  signalCount: number;
  reserved: number;
  signals: IReceiveSignal[];
}

interface IReceiveSignal {
  signalId: number;
  signalLength: number;
  sign: number;
  integer: number;
  decimal: number;
  value: number;
}

// 当前数据映射表 通过key值把信号id与信号值对应起来

const getTimeStamp = (buffer: Buffer): number => {
  // 把十六进制的表示转化成字符串，比如0x24转化成字符串"24"
  // 时间戳分隔符
  const timeStampDelimiter = "-";

  const getTime = (num:number) => {
    return Math.floor((num / 16)) * 10 + num % 16;
  }

  const year = getTime(buffer[4]);
  const month = getTime(buffer[5]);
  const day = getTime(buffer[6]);
  const hour = getTime(buffer[7]);
  const minute = getTime(buffer[8]);
  const second = getTime(buffer[9]);

  // 获得对应的时间戳  毫秒时间戳
  const data = new Date(year + 2000, month - 1, day, hour, minute, second);

  return data.getTime()
}

// 处理一个
export const decodingBoardMessage = (buffer: Buffer): IReceiveData => {
  const result = {} as IReceiveData;
  // 模块id
  result.moduleId = buffer[2];
  // 采集的类型，0表示总线采集，1表示数模采集
  result.collectType = buffer[3] >> 4;
  // 总线种类,如果是总线采集，表示总线种类，如果是数模采集，表示A还是D
  result.busType = buffer[3] & 0x0f;
  // 时间戳 4、5、6、7、8、9
  // result.timestamp = buffer[4] << 40 | buffer[5] << 32 | buffer[6] << 24 | buffer[7] << 16 | buffer[8] << 8 | buffer[9];
  // 如果都是0，用new Date().getTime()代替
  if (buffer[5] === 0) {
    result.timestamp = new Date().getTime();
  } else {
    result.timestamp = getTimeStamp(buffer);
  }
  //console.log("获取时间戳", result.timestamp)
  // 帧id 10、11、12、13
  result.frameId = getFrameId(buffer);
  // 14字节是信号数量
  result.signalCount = buffer[14];
  // 15字节是预留
  result.reserved = buffer[15];
  // const signals = splitBufferByDelimiter(buffer.subarray(12), Buffer.from([0xff, 0xff]));

  // 去掉前面16个字节
  const signalsPart = buffer.subarray(16);


  const key = getSignalMapKey(
    result.moduleId,
    result.collectType,
    result.busType,
    result.frameId
  )

  if (TestConfigService.digitalKeyList.includes(key)) {
    console.log("is Digital Key", signalsPart)
    // 第1-8个信号分别是第1-8位置，第9、10个信号是第9、10位置
    // 比如ff 03,第1-8个信号是ff的二进制1-8位置，都是1
    // 第9、10个信号是03的二进制1-2位置，都是0
    const values = [];
    for (let i = 0; i < 8; i++) {
      values.push((signalsPart[0] & (1 << (7 - i))) === 0 ? 0 : 1);
    }
    for (let i = 0; i < 2; i++) {
      values.push((signalsPart[1] & (1 << (1 - i))) === 0 ? 0 : 1);
    }
    result.signals = values.map((value, index) => {
      return {
        signalId: index,
        signalLength: 1,
        sign: 0,
        integer: value,
        decimal: 0,
        value: value
      }
    });
    return result;
  }

  // 每个信号6个字节
  const signalLength = 6;
  const signals = [];
  for (let i = 0; i < result.signalCount; i++) {
    const signal = signalsPart.subarray(i * signalLength, (i + 1) * signalLength);
    signals.push(decodingOneSignal(signal));
  }
  result.signals = signals;

  return result;
}

// 处理板卡状态的信息
export const decodingBoardStatus = (buffer: Buffer): boolean[] => {
  const result: boolean[] = []
  for (let i = 3; i <= 11; i++) {
    // 和1与
    result.push((buffer[i] & 0x01) === 0x01)
  }
  return result
}

// 做一个数据映射
// 把接收到的数据映射为一个object，key为getSignalKey，value为信号值
export const decodingBoardMessageWithMap = (receiveData: IReceiveData): Map<string, number> => {
  const key = getSignalMapKey(
    receiveData.moduleId,
    receiveData.collectType,
    receiveData.busType,
    receiveData.frameId
  )

  const values: number[] = []

  receiveData.signals.forEach(signal => {
    values.push(signal.value);
  })

  const result = new Map<string, number>();
  // 序列
  const signalOrder = TestConfigService.signalsMappingRelation.get(key)
  if (!signalOrder) {
    return result;
  }

  for (let i = 0; i < signalOrder.length; i++) {
    result.set(signalOrder[i], values[i]);
  }

  return result
}


const decodingOneSignal = (buffer: Buffer): IReceiveSignal => {
  const signalId = buffer[0];
  const signalLength = buffer[1] >> 1;
  const sign = buffer[1] & 0x01;
  const integer = buffer[2] << 12 | buffer[3] << 4 | buffer[4] >> 4;
  const decimal = (buffer[4] & 0x0f) << 8 | buffer[5];
  // 0表示正数，1表示负数
  const value = (integer + decimal / 1000) * (sign === 1 ? -1 : 1);

  return {
    signalId,
    signalLength,
    sign,
    integer,
    decimal,
    value
  }
}

// 根据buffer的信号获取frameId
const getFrameId = (buffer: Buffer): number => {
  const type = getCollectItemFromId(buffer[3])!
  switch (type) {
    case ProtocolType.FlexRay:
      return buffer[12] << 8 | buffer[13]
    case ProtocolType.CAN:
      return buffer[10] << 24 | buffer[11] << 16 | buffer[12] << 8 | buffer[13]
    case ProtocolType.MIC:
      return 0x00
    case ProtocolType.B1552B:
      return 0x00
    case ProtocolType.Serial422:
      return 0x00
    case ProtocolType.Serial232:
      return 0x00
    case ProtocolType.Analog:
      return 0x00
    case ProtocolType.Digital:
      return 0x00
    default:
      return 0x00
  }
}




