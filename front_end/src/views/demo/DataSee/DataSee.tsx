import React, {useEffect, useRef} from "react";
import {Affix, Button, Card, Descriptions, message, Space, Table, TableProps} from "antd";
import {FAIL_CODE} from "@/constants";
import {getBoardStatus, getCurrentTestConfig, getTcpConnectStatus, startTcpConnect, stopCurrentTestConfig, stopTcpConnect} from "@/apis/request/testConfig.ts";
import {ITestConfig} from "@/apis/standard/test.ts";
import {getActiveControllerList} from "@/apis/request/board-signal/controller.ts";
import {IController} from "@/views/demo/Topology/PhyTopology.tsx";


const DataSee = () => {
  const [currentDownConfig, setCurrentDownConfig] = React.useState<ITestConfig | undefined>(undefined);
  const [isReceiving, setIsReceiving] = React.useState<boolean>(false);

  const [boardStatus, setBoardStatus] = React.useState<boolean[]>([]);

  // 核心卡id和板卡状态对应键值的映射
  const coreBoardStatusMap = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    // 获取核心板卡列表
    getActiveControllerList().then(res => {
      if (res.code === FAIL_CODE) {
        message.error("核心办卡状态对应失败，请刷新重试")
        return;
      }
      let start = 6
      res.data.forEach((controller: IController) => {
        coreBoardStatusMap.current.set(controller.id, start);
        start++;
      });
    })
  }, []);

  const fetchCurrentConfig = () => {
    getCurrentTestConfig().then(res => {
      if (res.code === FAIL_CODE) {
        message.error(res.msg);
      } else {
        console.log('currentConfig:', res.data);
        setCurrentDownConfig(res.data);
      }
    });
  }

  // 前往查看当前数据
  const handleShowCurrentData = () => {
    const win = window.open(`/test-template-for-config?testConfigId=${currentDownConfig?.id}`);
    if (!win) return
  }

  // 停止接收-断开tcp连接
  const handleStopTcpConnect = async () => {
    const res = await stopTcpConnect()
    if (res.code === FAIL_CODE) {
      message.error(res.msg);
    } else {
      message.success('停止成功');
      setIsReceiving(false)
    }
  }

  // 开始接收-建立tcp连接
  const handleStartTcpConnect = async () => {
    const res = await startTcpConnect()
    if (!res) {
      message.error("请求失败或超时，请重新尝试")
      return
    }
    if (res.code === FAIL_CODE) {
      message.error(res.msg);
    } else {
      message.success('开始接收');
      setIsReceiving(true)
    }
  }

  // 获取tcp连接状态
  const handleGetTcpConnectStatus = async () => {
    const res = await getTcpConnectStatus()
    if (res.code === FAIL_CODE) {
      message.error(res.msg);
    } else {
      message.info(res.msg);
      console.log(res.data)
      setIsReceiving(res.data)
    }
  }

  const columns: TableProps<ITestConfig>['columns'] = [
    {
      title: 'id',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '测试任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '测试车辆',
      key: 'vehicle',
      render: (text, record) => (
        <span>{record.configs[0].vehicle.vehicleName}</span>
      ),
    },
    {
      title: '测试状态',
      dataIndex: 'testStat',
      key: 'testStat',
      render: (text, record) => {
        return <Space
          direction={"vertical"}
          align={"start"}
          style={{width: "300px"}}>
          <Descriptions size={"small"}>
            {
              record.configs.map(config => {
                return config.vehicle.collectUnits.map(unit => {
                  return <Descriptions.Item label={unit.collectUnitName} key={unit.collectUnitName}
                  >
                    <Space direction={"vertical"}>
                      {
                        <div style={{display: 'block'}}>
                          <span style={{color: !boardStatus[coreBoardStatusMap.current.get(unit.core.id)] ? 'red' : "green",}}>
                            {`核心板卡${unit.core.controllerName}:${!boardStatus[coreBoardStatusMap.current.get(unit.core.id)] ? '异常' : '正常'}`}
                          </span>
                        </div>
                      }
                      {
                        unit.collectors.map((board, index) => {
                          return <div key={index} style={{display: "block"}}>
                          <span style={{color: !boardStatus[board.collectorAddress - 2] ? 'red' : "green",}}>
                            {`${board.collectorName}:${!boardStatus[board.collectorAddress - 2] ? '异常' : '正常'}`}
                          </span>
                          </div>
                        })
                      }
                    </Space>
                  </Descriptions.Item>
                }).flat(2)
              }).flat(2)
            }
          </Descriptions>
        </Space>
      }
    },

    {
      title: `采集数据项${currentDownConfig ? (currentDownConfig.configs[0].projects ? ('(' + currentDownConfig.configs[0].projects[0].indicators.length + ')') : '未配置') : '无配置'}`,
      key: 'vehicle',
      render: (text, record) => (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}>
          {
            record.configs[0].projects.map(project => {
              return project.indicators.map(indicator => {
                return <span key={indicator.name}>{indicator.signal.name}</span>
              })
            }).flat(2)
          }
        </div>
      ),
    },
    // {
    //   title: '测试任务配置',
    //   key: 'set',
    //   render: (text, record) => (
    //     <Space direction={"vertical"} align={"start"}>
    //       {currentDownConfig?.id === record.id ?
    //         (<Button type={"link"} onClick={() => handleShowCurrentData()}>数据监视</Button>) : (" ")}
    //     </Space>
    //   ),
    // },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space align={"start"}>
          {
            (<Button type={"link"} onClick={() => handleShowCurrentData()}>数据监视</Button>)
          }
        </Space>
      ),
    },
  ];

  useEffect(() => {
    fetchCurrentConfig()
    handleGetTcpConnectStatus()
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const sendTime = new Date().getTime()
      getBoardStatus().then(res => {
        if (new Date().getTime() - sendTime > 300) {
          return;
        }
        if (res.code === FAIL_CODE) {
          message.error(res.msg);
        } else {
          setBoardStatus(res.data)
        }
      })
    }, 2000)

    return () => clearInterval(timer)
  }, []);

  return (
    <Card title={"当前测试任务"}
          style={{overflow: "scroll", overflowX: "hidden", height: "100vh", padding: "20px", display: "flex", flexDirection: "column"}}
    >
      <Table
        columns={columns}
        dataSource={!currentDownConfig ? [] : [currentDownConfig]}
        rowKey="id"
        style={{marginTop: "20px"}}
        locale={{emptyText: '暂无协议数据'}}
        pagination={false}
      />
    </Card>
  );
};

export default DataSee
