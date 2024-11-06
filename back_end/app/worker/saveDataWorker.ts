import {Sequelize} from "sequelize-typescript";
import DataModel, {IData} from "../model/Data.model";
import DataService from "../service/DataService";
import { format } from 'date-fns';

// 初始化 Sequelize 实例
console.log("初始化 Sequelize 实例");
const sequelize = new Sequelize({
  dialect: 'mysql',    // 数据库类型
  host: 'localhost',   // 数据库地址
  username: 'root',    // 数据库用户名
  password: 'root',    // 数据库密码
  database: 'vehicle'  // 数据库名称
});

// 手动注册模型
sequelize.addModels([DataModel]);

// 消息队列
const messageQueue: IData[][] = [];
let isProcessing = false;

const getRoundedTimeStep = (timeStep: number) => {
  return Math.pow(10, Math.round(Math.log10(timeStep)));
}

const manageData = (data: IData[]): IData[] => {
  // 对于每一个signalId的数据，取相同信号id的最后一个时间戳和第一个时间戳，然后根据时间戳的差值，取最接近的时间戳
  const signalIds = Array.from(new Set(data.map(item => item.signalId)));
  const result: IData[] = [];
  console.log('signalIds',signalIds);
  console.log('data',data.length);
  for (const signalId of signalIds) {
    const arr = data.filter(item => item.signalId === signalId);
    const length = arr.length;
    let timeStep = (arr[length - 1].time - arr[0].time) / (length + 1);
    timeStep = getRoundedTimeStep(timeStep);
    let time = arr[length - 1].time;
    const startDate = new Date(time);
    const formattedDate = format(startDate, 'yyyy-MM-dd HH:mm:ss.SSS');
    const endDate = new Date(arr[0].time);
    const formattedEndDate = format(endDate, 'yyyy-MM-dd HH:mm:ss.SSS');
    console.log('signalId',signalId);
    console.log('length',length);
    console.log('timeStep',timeStep);
    console.log('starttimestep',arr[0].time);
    console.log('endtimestep',arr[length - 1].time);
    console.log('startTime',formattedDate);
    console.log('endTime',formattedEndDate);
    for (let i = length - 1; i >= 0; i--) {
      result.unshift({
        ...arr[i],
        time
      });
      time -= timeStep;
    }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

// store the unique key for arr
const processedKeys = new Set<string>();
const UNIQUEKEY_LIMIT = 100_000

process.on('message', (data: IData[]) => {
  const answer = manageData(data);
  messageQueue.push(answer);
  processQueue();
});

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) {
    return;
  }

  isProcessing = true;
  const data = messageQueue.shift() ?? [];

  const uniqueData = data!.filter(item => {
    const key = `${item.signalId}-${item.time}-${item.value}`;
    if (processedKeys.has(key)) {
      return false;
    }
    processedKeys.add(key);
    if (processedKeys.size > UNIQUEKEY_LIMIT) {
      processedKeys.clear();
    }
    return true;
  });

  // 过滤值不是number
  const result = uniqueData.filter(item => item.time !== undefined);

  try {
    // 确保数据库同步
    await sequelize.sync();

    // 调用 DataService 的 addData 方法
    await DataService.addData(result!);

    // 向主进程发送成功消息
    if (messageQueue.length === 0) {
      // @ts-ignore
      process.send('all data is stored');
    }
  } catch (error) {
    // 向主进程发送错误消息并打印错误
    // @ts-ignore
    process.send('error');
    console.error(error);
  } finally {
    isProcessing = false;
    processQueue();
  }
}
