/**
 * create by lby
 */

import TestConfig, {
  CurrentTestConfig,
  ITestConfig,
} from "../model/TestConfig";
import {
  getBusCategory,
  getCollectType,
  getConfigBoardMessage,
} from "../../utils/BoardUtil/encoding";
import {
  connectWithMultipleBoards,
  disconnectWithBoard,
  reconnectWithMultipleBoards,
  sendMultipleMessagesBoard,
} from "../ztcp/toBoard";
import * as fs from "fs";
import path from "node:path";
import { ProtocolType } from "../model/PreSet/Protocol.model";
import { getSignalMapKey } from "../../utils/BoardUtil/encoding/spConfig";
import { startMockBoardMessage, stopMockBoardMessage } from "../ztcp/toFront";
import { IData } from "../model/Data.model";
import DataService from "./DataService";
import historyService from "./HistoryService";
import { formatHeader, formatOneSignal } from "../../utils/File/format";
import { fork } from "child_process";

export const CURRENT_DATA_LIMIT = 1_000;
export const CURRENT_HISTORY_SIGN = "(正在下发...)";

class TestConfigService {
  currentTestConfig: ITestConfig | null = null;
  currentTestConfigHistoryData: {
    time: number;
    data: {
      [key: number]: number;
    };
  }[] = [];

  resultMessages: Buffer[] = [];
  // 由采集项id、帧id等组成的key值和signal的id(之前是uuid现在是序号数组)对应的map
  signalsMappingRelation: Map<string, string[]> = new Map();
  // 信号的id和他的名称对应的数组
  signalsIdNameMap: Map<
    string,
    {
      name: string;
      dimension: string;
    }
  > = new Map();
  // 当前所属历史的id
  currentHistoryId: number = 0;
  banMessage: Buffer[] = [];
  enableMessage: Buffer[] = [];
  isEnabling: boolean = false;

  // 因为digital解析方式比较特殊，所以需要单独处理
  digitalKeyList: string[] = [];

  // 各个板卡的连接状态
  boardConnectStatus: boolean[] = [];

  //加入北斗受时的状态判断
  useBeidou: boolean = false;

  /**
   * 创建测试配置
   * @param param
   */
  async createTestConfig(param: ITestConfig): Promise<ITestConfig | null> {
    try {
      return await TestConfig.create(param);
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  /**
   * 通过id删除测试配置
   * @param id
   */
  async deleteTestConfigById(id: number): Promise<boolean> {
    try {
      await TestConfig.destroy({
        where: {
          id: id,
        },
      });
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * 通过id更新测试配置
   * @param id
   * @param param
   */
  async updateTestConfigById(id: number, param: ITestConfig): Promise<boolean> {
    try {
      await TestConfig.update(param, {
        where: { id },
      });
      if (id === this.currentTestConfig?.id) {
        this.currentTestConfig = param;
      }
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * 通过id查询测试配置
   * @param id
   */
  async getTestConfigById(id: number): Promise<ITestConfig | null> {
    try {
      const testConfig = await TestConfig.findByPk(id);
      return testConfig;
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  /**
   * 查询所有测试配置
   */
  async getAllTestConfig(): Promise<TestConfig[] | null> {
    try {
      const testConfig = await TestConfig.findAll();
      return testConfig;
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  async getCurrentTestConfig() {
    return this.currentTestConfig;
  }

  async getHostPortList(testConfig: ITestConfig) {
    const result: Array<{ host: string; port: number }> = [];

    testConfig.configs.forEach((config) => {
      config.vehicle.protocols.forEach((protocol) => {
        result.push({
          host: protocol.core.controllerAddress!,
          port: 66,
        });
      });
    });

    const map = new Map();
    result.forEach((item) => {
      if (!map.has(item.host)) {
        map.set(item.host, true);
      }
    });

    return Array.from(map.keys()).map((item) => {
      return {
        host: item,
        port: 66,
      };
    });
  }

  async getSpecialDigitalKeyList(testConfig: ITestConfig) {
    const result: string[] = [];

    testConfig.configs.forEach((config) => {
      config.vehicle.protocols.forEach((protocol) => {
        protocol.protocol.signalsParsingConfig.forEach((spConfig) => {
          spConfig.signals.forEach((signal) => {
            const key = getSignalMapKey(
              protocol.collector.collectorAddress!,
              getCollectType(protocol),
              getBusCategory(protocol),
              Number(spConfig.frameId)
            );
            if (protocol.protocol.protocolType === ProtocolType.Digital) {
              result.push(key);
            }
          });
        });
      });
    });
    this.digitalKeyList = result;
  }

  // 下发测试流程，设置当前的测试流程为testPrdcessN
  async downTestConfig(testConfigId: number) {
    if (this.currentTestConfig) return "当前已经有测试配置在下发中";
    const testConfig = await this.getTestConfigById(testConfigId);
    if (!testConfig) return "获取对应配置失败";

    const res = getConfigBoardMessage(testConfig!);
    console.log(res);
    const hostPortList = await this.getHostPortList(testConfig);

    // 解析下发的配置，获取需要下发的信息、信号的映射
    this.resultMessages = res.resultMessages;
    this.isEnabling = false;
    console.log(this.resultMessages);
    this.signalsMappingRelation = res.signalsMap;
    this.banMessage = res.banMessages;
    this.enableMessage = res.enableMessage;
    this.currentTestConfig = testConfig;
    this.setSignalsIdNameMap(testConfig);
    // 获取北斗受时
    this.useBeidou = testConfig.dataWrap.useBeidou;
    console.log("北斗受时", this.useBeidou);
    await this.getSpecialDigitalKeyList(testConfig!);
    // 创建一条新的记录
    await this.createNewRecord(testConfig!);

    // TODO 连接下位机并且发送消息,调试的时候没有下位机所以注释掉，使用startMock
    // 下发逻辑放到后面，因为要等到所有的数据都准备好了才能下发,并且如果失败、停止下发的时候比较Ok
    try {
      await connectWithMultipleBoards(hostPortList, 0, this.useBeidou);
    } catch (e) {
      return "连接下位机失败";
    }

    // 发送所有消息给板子
    try {
      await sendMultipleMessagesBoard(res.resultMessages, 1000);
    } catch (e) {
      return "向下位机发送消息失败";
    }
    await this.storeCurrentConfigToSql(testConfig!);

    // TODO 模拟数据
    // startMockBoardMessage(this.signalsMappingRelation);
    return undefined;
  }

  // 在数据库新建一条记录
  async createNewRecord(testConfig: ITestConfig) {
    const result = await historyService.addHistory({
      testConfig: testConfig,
      path: "",
      vehicleName: testConfig.configs[0].vehicle.vehicleName,
      fatherConfigName: testConfig.name + CURRENT_HISTORY_SIGN,
      size: "0",
    });
    this.currentHistoryId = result.id;
  }

  setSignalsIdNameMap(testConfig: ITestConfig) {
    testConfig.configs.forEach((config) => {
      config.projects.forEach((project) => {
        project.indicators.forEach((indicator) => {
          this.signalsIdNameMap.set(indicator.signal.id, {
            name: `${indicator.name}`,
            dimension: indicator.signal.dimension,
          });
        });
      });
    });
  }

  /**
   * 停止当前下发
   */
  async stopCurrentTestConfig() {
    // stopMockBoardMessage();
    await sendMultipleMessagesBoard(this.banMessage, 200);
    setTimeout(
      async (
        historyId,
        testConfigId,
        currentTestConfigName,
        currentHistoryData
      ) => {
        console.log("下载文件");
        console.log(
          historyId,
          testConfigId,
          currentTestConfigName,
          currentHistoryData.length
        );

        await historyService.updateHistoryName(
          historyId,
          currentTestConfigName!
        );
        await this.saveCurrentDataToSql(
          currentTestConfigName!,
          historyId,
          currentHistoryData,
          true
        );
        await this.downHistoryDataAsFormat(historyId, testConfigId!);

        console.log("保存完成");
      },
      1000,
      this.currentHistoryId,
      this.currentTestConfig?.id,
      this.currentTestConfig?.name,
      Array.from(this.currentTestConfigHistoryData)
    );

    await this.clearCurrent();
    return true;
  }

  async pushDataToCurrentHistory(data: {
    time: number;
    data: {
      [key: number]: number;
    };
  }) {
    // 如果当前的currentTestConfigHistory超过了CURRENT_DATA_LIMIT，那么存储到数据库
    if (this.currentTestConfigHistoryData.length > CURRENT_DATA_LIMIT) {
      console.log(
        "存储到数据库,当前数据量",
        this.currentTestConfigHistoryData.length
      );
      const arr = Array.from(this.currentTestConfigHistoryData);
      this.clearOnlyData();
      await this.saveCurrentDataToSql(
        this.currentTestConfig!.name,
        this.currentHistoryId,
        arr
      );
    }
    this.currentTestConfigHistoryData.push(data);
  }

  clearOnlyData() {
    console.log("清空数据");
    this.currentTestConfigHistoryData = [];
  }

  async clearCurrent() {
    this.currentTestConfig = null;
    this.signalsMappingRelation.clear();
    this.clearOnlyData();
    this.resultMessages = [];
    this.banMessage = [];
    this.digitalKeyList = [];
    this.currentHistoryId = 0;
    // this.signalsIdNameMap.clear()
    this.boardConnectStatus = [];
    // 清空状态
    await this.deleteCurrentConfigFromSql();
    disconnectWithBoard();
  }

  async storeCurrentConfigToSql(config: ITestConfig) {
    await this.deleteCurrentConfigFromSql();
    await CurrentTestConfig.create(config);
  }

  async getCurrentConfigFromSql() {
    // 使用findOne方法获取第一条记录
    const config = await CurrentTestConfig.findOne({
      order: [
        ["id", "ASC"], // 按照id升序排序
      ],
    });
    return config;
  }

  async deleteCurrentConfigFromSql() {
    try {
      await CurrentTestConfig.destroy({
        where: {}, // 不传入任何条件，将删除所有记录
        truncate: true, // 这将重置自增ID
      });
      console.log("Table CurrentTestConfig has been cleared.");
    } catch (error) {
      console.error("Failed to clear the table CurrentTestConfig:", error);
    }
  }

  // 尝试恢复之前下发配置
  async tryRecoverConfig() {
    const config = await this.getCurrentConfigFromSql();
    if (config) {
      console.log("之前的数据为", config);
      await this.downTestConfig(config.id);
    }
  }

  async downHistoryDataAsFormat(historyId: number, testConfigId: number) {
    const testConfig = await this.getTestConfigById(testConfigId);
    const historyName =
      (testConfig?.name ?? "默认名称") +
      new Date().getHours() +
      new Date().getMinutes() +
      new Date().getSeconds();
    const currentDate =
      new Date().getFullYear() +
      "-" +
      (new Date().getMonth() + 1) +
      "-" +
      new Date().getDate();

    let dir = "../public/uploads/" + currentDate;
    dir = path.resolve(__dirname, dir);
    fs.mkdirSync(dir, { recursive: true });

    const targetPath = path.resolve(
      __dirname,
      `../public/uploads/${currentDate}/${historyName}.txt`
    );
    // 確保targetPath有文件
    fs.writeFileSync(targetPath, "");
    const writeStream = fs.createWriteStream(targetPath);

    const header = formatHeader(testConfig!);
    writeStream.write(header + "\n");

    let writeArr = await DataService.getDataWithScope(historyId, 1, 100000);
    let searchArr: any[] = [];
    let page = 1;
    const pageSize = 100_000;

    const writeHalfData = async (
      dataArray: IData[],
      writeStream: fs.WriteStream
    ) => {
      const halfIndex = Math.floor(dataArray.length / 2);
      for (let i = 0; i < halfIndex; i++) {
        writeStream.write(formatOneSignal(dataArray[i]) + "\n");
      }
      return dataArray.slice(halfIndex); // 返回未写入的数据
    };

    while (writeArr.length > 0 || searchArr.length > 0) {
      // 写入 writeArr 前半部分数据，同时开始并行获取 searchArr
      const halfWriteArr = await writeHalfData(writeArr, writeStream);

      // 并行获取 searchArr（下一批数据）
      const searchPromise = DataService.getDataWithScope(
        historyId,
        page + 1,
        pageSize
      );
      page += 1;

      // 写入 writeArr 剩下的部分
      for (const data of halfWriteArr) {
        writeStream.write(formatOneSignal(data) + "\n");
      }

      // 等待 searchArr 数据获取完成
      searchArr = await searchPromise;

      // 将 writeArr 替换为 searchArr，searchArr 置为空
      writeArr = searchArr;
      searchArr = [];
    }

    // 关闭写入流
    writeStream.end();

    await historyService.updateHistoryPath(
      historyId,
      `/uploads/${currentDate}/${historyName}.txt`
    );

    return true;
  }

  child = fork(path.resolve(__dirname, "../worker/saveDataWorker.ts"));

  async saveCurrentDataToSql(
    configName: string,
    historyId: number,
    currentData: {
      time: number;
      data: {
        [key: number]: number;
      };
    }[],
    waitClear: boolean = false
  ): Promise<boolean> {
    // 存储到数据库
    const data: IData[] = [];
    currentData.forEach((item) => {
      for (let key in item.data) {
        if (item.time !== undefined) {
          data.push({
            belongId: historyId,
            signalId: key,
            configName: configName,
            name: this.signalsIdNameMap.get(key)?.name!,
            dimension: this.signalsIdNameMap.get(key)?.dimension!,
            time: item.time,
            value: item.data[key],
          });
        }
      }
    });
    return new Promise((resolve, reject) => {
      const handleMessage = (message: string) => {
        if (
          message === "all data is stored" ||
          (waitClear && message === "all data clear")
        ) {
          resolve(true);
        }
      };
      console.log("发送了一批数据，数据长度：", data.length);
      this.child.once("message", handleMessage);

      try {
        this.child.send(data);

        if (!waitClear) {
          // 如果不需要等待清空，则直接返回
          resolve(true);
        }
      } catch (error) {
        this.child.kill();
        this.child = fork(
          path.resolve(__dirname, "../worker/saveDataWorker.ts")
        );
        this.child.once("message", handleMessage);
        this.child.send(data);

        if (!waitClear) {
          // 如果不需要等待清空，则直接返回
          resolve(true);
        }
      }
    });
  }

  // 发送ban的消息
  async stopCurrentTcp() {
    await sendMultipleMessagesBoard(this.banMessage, 200);
    this.isEnabling = false;
    return true;
  }

  // 发送使能消息
  async startCurrentTcp() {
    await sendMultipleMessagesBoard(this.enableMessage, 200);
    this.isEnabling = true;
    return true;
  }

  updateBoardStatus(status: boolean[]) {
    this.boardConnectStatus = status;
  }

  getBoardStatus() {
    return this.boardConnectStatus;
  }
}

export default new TestConfigService();
