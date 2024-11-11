import net from "node:net";
import {decodingBoardMessage, decodingBoardMessageWithMap, decodingBoardStatus, IReceiveData, ITimeData, splitBufferByDelimiter} from "../../utils/BoardUtil/decoding";
import {IFrontMessage, sendMessageToFront} from "./toFront";
import TestConfigService from "../service/TestConfig";
import {getFrontFormatMessage} from "../../utils";

let client: net.Socket;
let reconnectInterval = 5000; // 重连间隔 5 秒
let isManuallyClosed = false; // 是否主动断开
// 数据断连定时器
let dataTimer: NodeJS.Timeout | null = null;
// 重开定时器
let reconnectTimer: NodeJS.Timeout | null = null;
// 设置连接的过时器
const CONNECTION_TIMEOUT = 5; // 连接超时时间为1秒
export const mapToJson = (map: Map<string, ITimeData>) => {
  const obj: { [key: string]: ITimeData } = {};
  map.forEach((value, key) => {
    obj[key] = value;
  })
  return JSON.stringify(obj);
}

// 重置数据定时器
function resetDataTimer() {
  if (dataTimer) {
      clearTimeout(dataTimer);
  }
  dataTimer = setTimeout(() => {
      console.log('No data received for a while, attempting to reconnect...');
      if(client) client.destroy();
  }, 2000);//2000毫秒接收不到数据就断开连接 这里是属于被动断开
}

// 设置重新连接的定时器
function scheduleReconnect(hostPortList: Array<{ host: string, port: number }>,
  index = 0,
  useBeidou: boolean = true) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log('是否手动关闭1',isManuallyClosed);
  if(!isManuallyClosed){
    reconnectTimer = setTimeout(() => {
      console.log('尝试重新连接...');
      connectWithMultipleBoards(hostPortList, 0, useBeidou); // 尝试重新连接
  }, 1000); // 每1秒尝试一次重新连接
  }else{
    console.log('手动关闭连接，不再尝试重新连接');
  }
}

// 定义一个递归函数来遍历host和port数组
export const connectWithMultipleBoards = (
  hostPortList: Array<{ host: string, port: number }>,
  index = 0,
  useBeidou: boolean = true
) => {
  // 狗屎才能写出来的狗屎代码
  // isManuallyClosed = false
  return new Promise<boolean>((resolve, reject) => {
    if (index >= hostPortList.length) {
      reject(false);
      return;
    }

    const {host, port} = hostPortList[index];

    console.log(`尝试连接: ${host}:${port}`);

    let isTimeout = false;
    // 设置连接超时
    // client.setTimeout(CONNECTION_TIMEOUT);
    const timeOut = setTimeout(() => {
      if(client) client.destroy();
      console.log(`连接超时: ${host}:${port}`);
      // isTimeout = true;
      // reject(new Error('连接超时'));
    }, 5000);

    client = net.connect({
      port,
      host,
    }, () => {
      console.log(`${port} ${host} 建立链接成功`);
      if(timeOut) clearTimeout(timeOut);
      // 连接成功后关闭重连计时器
      if(reconnectTimer) clearTimeout(reconnectTimer);
      // 启动时启动数据重连计时器
      // resetDataTimer();
      resolve(true);
    });
    
    client.on('data', (data) => {
      resetDataTimer();// 收到数据后重置数据断开计时器
      try {
        // 1. 解析数据,
        const datas = splitBufferByDelimiter(data, Buffer.from([0xcd, 0xef]));
        const messages: IReceiveData[] = []
        datas.forEach((item) => {
          // 用来处理表示各个板卡是否有用的信息
          if (item[0] === 0xcd && item[1] === 0xef && item[2] === 0xed) {
            const status = decodingBoardStatus(item)
            // console.log("获取板卡状态:", status)
            TestConfigService.updateBoardStatus(status)
            return
          }
          messages.push(decodingBoardMessage(item))
        })

        const resolveMessage = (receiveData: IReceiveData) => {
          // 结果，每个信号对应的 -> 时间和值
          const result = decodingBoardMessageWithMap(receiveData);

          const message: { [key: string]: number } = {}
          result.forEach((value, key) => {
            message[key] = value
          })

          //console.log("decodingBoardMessageWith Map result ", result);
          const msg:{ [key: string]: number } = {}
          result.forEach((value, key) => {
            msg[key] = value
          })

          if (messages.length > 0 && messages[0].timestamp !== undefined) {
            TestConfigService.pushDataToCurrentHistory({
              time: useBeidou ? messages[0].timestamp : new Date().getTime(),
              data: msg
            })
          }

          const responseMessage = getFrontFormatMessage(message, new Date().getTime())
          // 发送消息给前端
          sendMessageToFront({
            type: 'DATA',
            message: mapToJson(responseMessage)
          });
        }

        messages.forEach((message) => {
          resolveMessage(message)
        })
      } catch (e) {
        console.log("这里出错了")
      }
    });

    client.on('end', () => {
      console.log('连接已结束');
      if(dataTimer) clearTimeout(dataTimer);
      if(reconnectTimer) clearTimeout(reconnectTimer);
      //没用的狗屎逻辑
      // if (!isManuallyClosed) {
      //   setTimeout(() => {
      //     reconnectWithMultipleBoards(hostPortList, index,true);
      //   }, reconnectInterval);
      // }
    });
    client.on('close', () => {
      console.log('连接已关闭');
      if(dataTimer) clearTimeout(dataTimer);
      console.log('是否手动关闭2',isManuallyClosed);
      // 没有手动关闭的情况下尝试重连
      if(!isManuallyClosed){
        scheduleReconnect(hostPortList, index,true);
      }
    });

    client.on('error', (err) => {
      console.log(`连接错误: ${err.message}`, `中断类型`, isManuallyClosed ? '手动' : '被动');

      // 如果client已经end，就不需要重连了
      if (isTimeout) {
        console.log("client 已经超时，不再重连")
        return;
      }

      // 没用的狗屎逻辑
      // if (!isManuallyClosed) {
      //   console.log('尝试下一个连接', 'ip:', hostPortList[index].host, 'port:', hostPortList[index].port);
      //   connectWithMultipleBoards(hostPortList, index + 1)
      //     .then(resolve)
      //     .catch(reject);
      // } else {
      //   client.end();
      //   reject(err);
      // }
    });
  });
};

// 重连逻辑，使用相同的数组
export const reconnectWithMultipleBoards = async (hostPortList: Array<{ host: string, port: number }>,
                                                  index = 0,
                                                  clearManuallyClosed: boolean = false
) => {
  if (clearManuallyClosed) {
    isManuallyClosed = false
  }
  if (!isManuallyClosed) {
    console.log("重连中");
    sendMessageToFront({
      type: 'NOTIFICATION',
      message: '正在尝试与下位机重新连接...'
    });
    return await connectWithMultipleBoards(hostPortList, index);
  } else {
    console.log("不重连");
    return false;
  }
};


// 主动断开连接
export const disconnectWithBoard = () => {
  isManuallyClosed = true;
  if (client) {
    client.destroy(); // 结束连接
    console.log('Connection closed manually');
    console.log('是否主动断开3',isManuallyClosed);
    
  }
}

// 发送消息
export const sendMessageToBoard = (message: Buffer) => {
  if (client && client.writable) {
    client.write(message);
    console.log("send to board")
    console.log(message);
  } else {
    console.log('Cannot send message. Client not connected.');
  }
}

// 发送多条消息，并设置间隔时间
export const sendMultipleMessagesBoard = (messages: Buffer[], interval = 1000) => {
  let index = 0;

  return new Promise<void>((resolve) => {
    function sendNextMessage() {
      if (index < messages.length) {
        try {
          sendMessageToBoard(messages[index]);
          index++;
          setTimeout(sendNextMessage, interval); // 递归设置下一条消息的发送时间
          console.log("發送了", index)
        } catch (e) {
          console.log("發送出錯了", e)
        }
      } else {
        resolve(); // 所有消息发送完毕，解析Promise
      }
    }

    sendNextMessage();
  });
}

export const getTcpClient = () => {
  return client
}
