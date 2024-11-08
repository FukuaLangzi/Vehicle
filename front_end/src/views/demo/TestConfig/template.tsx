import React, { useEffect, useRef, useState } from "react";
import { useDrop } from "react-dnd";
import DraggableComponent, {
  IBooleanChartExtra,
  IDraggleComponent,
  INumberChartExtra,
} from "@/views/demo/DataDisplay/DraggableComponent";
import { Button, Input, message, Modal, Slider, Space } from "antd";
import { DragItemType } from "@/views/demo/DataDisplay/display.tsx";
import GridLayout from "react-grid-layout";
import { DEFAULT_TITLE, SUCCESS_CODE } from "@/constants";
import { IProtocolSignal } from "@/views/demo/ProtocolTable/protocolComponent.tsx";
import {
  getTestConfigById,
  updateTestConfigById,
} from "@/apis/request/testConfig.ts";
import { ITestConfig } from "@/apis/standard/test.ts";
import ConfigDropContainer from "@/views/demo/TestConfig/configDropContainer.tsx";
import { ITemplate, ITemplateItem } from "@/apis/standard/template.ts";
import { getTestsHistoryById } from "@/apis/request/testhistory.ts";
import { BASE_URL } from "@/apis/url/myUrl.ts";
import { debounce, formatTime } from "@/utils";
import { fgetSampledData } from "@/apis/request/data.ts";
import { IHistoryList } from "@/views/demo/History/history.tsx";
// 引入参数管理
import useParamsStore from "../../../store/store.ts";
export interface ITimeData {
  idui: any;
  time: number;
  value: number;
}

export interface IDragItem {
  id: string;
  type: DragItemType;
  itemConfig: {
    requestSignalId: number | null;
    requestSignals: IProtocolSignal[];
    colors?: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    interval: number;
    trueValue?: string;
    trueLabel?: string;
    falseLabel?: string;
    unit?: string;
    during?: number;
    min?: number;
    max?: number;
    label?: string;
    windowSize?: number;
    linetype?: number;
  };
}

// dataMode 不用放到useEffect，因为它不会变
const TestTemplateForConfig: React.FC<{
  dataMode: "OFFLINE" | "ONLINE";
}> = () => {
  const [testConfig, setTestConfig] = useState<ITestConfig | null>(null);
  const [mode, setMode] = useState<"CHANGING" | "COLLECTING">("CHANGING");

  const ref = useRef<HTMLDivElement>(null);
  const [dragItems, setDragItems] = useState<IDragItem[]>([]);
  const socketRef = useRef<WebSocket>(null);

  const dataRecorderRef = useRef(new Map<string, ITimeData[]>());
  const [netDataRecorder, setNetDataRecorder] = useState<
    Map<string, ITimeData[]>
  >(new Map());

  const [history, setHistory] = useState<IHistoryList>(null);
  // 打开
  const [openReplaySearch, setOpenReplaySearch] = useState(false);

  const dataCacheRef = useRef<{
    [key: string]: ITimeData[];
  }>({});
  // 节流
  const dataThrottleTimeOut = useRef(null);

  // 是数据回放
  const [isReplayModal, setIsReplayModal] = useState(false);

  const updateDataRecorder = (data: { [key: string]: ITimeData }) => {
    Object.keys(data).forEach((key) => {
      if (!dataCacheRef.current[key]) {
        dataCacheRef.current[key] = [];
      }
      dataCacheRef.current[key].push(data[key]);
    });

    if (dataThrottleTimeOut.current !== null) {
      return;
    }

    dataThrottleTimeOut.current = setTimeout(() => {
      clearTimeout(dataThrottleTimeOut.current);
      dataThrottleTimeOut.current = null;
    }, 1000);

    Object.keys(dataCacheRef.current).forEach((key) => {
      if (!dataRecorderRef.current.has(key)) {
        dataRecorderRef.current.set(key, []);
      }
      // 把dataCache的推进去，如果大于1000，取后1000条
      dataRecorderRef.current.get(key).push(...dataCacheRef.current[key]);
      if (dataRecorderRef.current.get(key).length > 1000) {
        dataRecorderRef.current.set(
          key,
          dataRecorderRef.current.get(key).slice(-1000)
        );
      }
    });
    dataCacheRef.current = {};
    setNetDataRecorder(new Map(dataRecorderRef.current));
  };

  // 数据回放前置操作
  const dataReplayPreparation = async (historyId: string) => {
    // 从历史记录中获取数据
    const res = await getTestsHistoryById(Number(historyId));
    if (res.code === SUCCESS_CODE) {
      setHistory(res.data);
      const testConfig = res.data.testConfig as ITestConfig;

      setTestConfig(testConfig);
      setDragItems(transferITemplateToDragItems(testConfig.template));
    }
  };

  // 在线数据展示前置操作
  const onlinePresentation = async (testConfigId: string) => {
    let testConfig: ITestConfig = undefined;
    const res = await getTestConfigById(Number(testConfigId));
    if (res.code === SUCCESS_CODE) {
      testConfig = res.data as ITestConfig;
      setTestConfig(testConfig);
      setDragItems(transferITemplateToDragItems(testConfig.template));
    }
    return;
  };

  // 在线、离线数据的时候获取testConfig
  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const testConfigId = params.get("testConfigId") ?? undefined;
    const historyId = params.get("historyId") ?? undefined;

    // 如果是在线数据源
    if (testConfigId) {
      onlinePresentation(testConfigId);
    } else if (historyId) {
      // 如果是离线数据回放
      setIsReplayModal(true);
      dataReplayPreparation(historyId);
    }
  }, []);

  // 处理在线数据源头
  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const testConfigId = params.get("testConfigId") ?? undefined;
    if (!testConfigId) {
      return;
    }

    window.onbeforeunload = function () {
      return "你确定要离开吗？";
    };

    let url = BASE_URL;
    url = url.replace("3000/api", "8080");
    const socket = new WebSocket(url + "/ws");
    socket.onopen = () => {
      socketRef.current = socket;
    };
    socket.onclose = () => {
      socketRef.current = null;
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "DATA") {
        updateDataRecorder(JSON.parse(message.message));
      } else if (message.type === "NOTIFICATION") {
        message.info(message.message);
      }
    };

    // 清理 WebSocket 连接
    return () => {
      socket.close();
    };
  }, []);

  const [, drop] = useDrop<{ id: string } & IDraggleComponent>({
    accept: "box",
    drop({
      id,
      type,
      draggleConfig: {
        defaultX,
        defaultY,
        defaultHeight,
        defaultWidth,
        defaultTitle,
        defaultInterval,
        extra,
      },
    }) {
      const itemConfig: IDragItem["itemConfig"] = {
        requestSignalId: null,
        requestSignals: [],
        colors: [],
        x: defaultX,
        y: defaultY,
        width: defaultWidth,
        height: defaultHeight,
        title: defaultTitle,
        interval: defaultInterval,
      };
      switch (type) {
        case DragItemType.BOOLEAN:
          itemConfig["trueLabel"] = (
            extra as IBooleanChartExtra
          ).defaultTrueLabel;
          itemConfig["falseLabel"] = (
            extra as IBooleanChartExtra
          ).defaultFalseLabel;
          break;
        case DragItemType.NUMBER:
          itemConfig["unit"] = (extra as INumberChartExtra).defaultUnit;
          itemConfig["min"] = (extra as INumberChartExtra).defaultMin;
          itemConfig["max"] = (extra as INumberChartExtra).defaultMax;
          break;
      }
      setDragItems([
        ...dragItems,
        {
          id,
          type,
          itemConfig: { ...itemConfig },
        },
      ]);
    },
  });
  drop(ref);

  const renderADDModeInfo = () => {
    return (
      <>
        <DraggableComponent
          type={DragItemType.BOOLEAN}
          draggleConfig={{
            defaultTitle: DEFAULT_TITLE,
            defaultX: 0,
            defaultY: 0,
            defaultWidth: 200,
            defaultHeight: 200,
            defaultInterval: 1000,
            extra: {
              defaultTrueLabel: "是",
              defaultFalseLabel: "否",
            },
          }}
        />
        <DraggableComponent
          type={DragItemType.NUMBER}
          draggleConfig={{
            defaultTitle: DEFAULT_TITLE,
            defaultX: 0,
            defaultY: 0,
            defaultWidth: 200,
            defaultHeight: 200,
            defaultInterval: 1000,
            extra: {
              defaultUnit: "单位",
              defaultMin: 0,
              defaultMax: 100,
            },
          }}
        />
        <DraggableComponent
          type={DragItemType.LINES}
          draggleConfig={{
            defaultTitle: DEFAULT_TITLE,
            defaultX: 0,
            defaultY: 0,
            defaultWidth: 200,
            defaultHeight: 200,
            defaultInterval: 1000,
            extra: {
              defaultDuring: 10, // 10s
              defaultLabel: "数值",
            },
          }}
        />
        <DraggableComponent
          type={DragItemType.PURENUMBER}
          draggleConfig={{
            defaultTitle: DEFAULT_TITLE,
            defaultX: 0,
            defaultY: 0,
            defaultWidth: 100,
            defaultHeight: 100,
            defaultInterval: 1000,
            extra: {
              defaultDuring: 10, // 10s
              defaultLabel: "数值",
            },
          }}
        />
      </>
    );
  };

  const updateDragItem = (id: string, itemConfig: IDragItem["itemConfig"]) => {
    console.log("新的", itemConfig);
    const result = dragItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          itemConfig: {
            ...item.itemConfig,
            ...itemConfig,
          },
        };
      }
      return item;
    });
    console.log("result", result);

    setDragItems(result);
  };

  const updateAllByLayout = (layout: GridLayout.Layout[]) => {
    const result = dragItems.map((item) => {
      const newItem = layout.find((newItem) => newItem.i === item.id);
      if (newItem) {
        return {
          ...item,
          itemConfig: {
            ...item.itemConfig,
            width: newItem.w * 30,
            height: newItem.h * 30,
            x: newItem.x,
            y: newItem.y,
          },
        };
      }
      return item;
    });
    setDragItems(result);
  };
  // 更新数据需要执行的函数
  const handleUpdateData = (startTime?: any, endTime?: any, count?: any) => {
    if (!startTime || !endTime || !count) {
      setOpenReplaySearch(false);
      return;
    }
    message.success("开始查询");
    fgetSampledData(history.id, startTime, endTime, count).then((res) => {
      console.log("res", res);

      if (res.code === SUCCESS_CODE) {
        setNetDataRecorder(new Map(Object.entries(res.data)));
        message.success("查询成功");
      } else {
        message.error("查询失败");
      }
    });
    setOpenReplaySearch(false);
  };

  const renderManageButton = () => {
    const confirmChangeConfig = () => {
      const config = Object.assign({}, testConfig);
      config.template = transferDragItemsToITemplate(dragItems);
      updateTestConfigById(config.id, config).then((res) => {
        if (res.code === SUCCESS_CODE) {
          message.success("更新成功");
        }
      });
    };

    if (mode === "COLLECTING") {
      return (
        <Space direction="vertical" size="middle">
          <Button
            onClick={() => {
              confirmChangeConfig();
            }}
          >
            保存此布局
          </Button>

          <Button
            onClick={() => {
              setMode("CHANGING");
            }}
          >
            切换至配置模式
          </Button>

          {isReplayModal && (
            <Button
              onClick={() => {
                setOpenReplaySearch(true);
              }}
            >
              数据回放
            </Button>
          )}
          <ReplaySearchModal
            history={history}
            open={openReplaySearch}
            onFinished={handleUpdateData}
          />
        </Space>
      );
    }

    return (
      <div
        style={{
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 10,
          position: "absolute",
          top: 0,
          right: 0,
        }}
      >
        <Button
          onClick={() => {
            confirmChangeConfig();
            setMode("COLLECTING");
          }}
        >
          切换至查看模式
        </Button>
        <div className="dd_info">{renderADDModeInfo()}</div>
      </div>
    );
  };

  const transferDragItemsToITemplate = (dragItems: IDragItem[]): ITemplate => {
    return {
      name: "默认模板",
      description: "默认描述",
      itemsConfig: dragItems.map((item) => {
        return {
          type: item.type,
          requestSignalId: item.itemConfig.requestSignalId,
          requestSignals: item.itemConfig.requestSignals,
          colors: item.itemConfig.colors,
          x: item.itemConfig.x,
          y: item.itemConfig.y,
          width: item.itemConfig.width,
          height: item.itemConfig.height,
          title: item.itemConfig.title,
          interval: item.itemConfig.interval,
          trueLabel: item.itemConfig.trueLabel,
          falseLabel: item.itemConfig.falseLabel,
          unit: item.itemConfig.unit,
          during: item.itemConfig.during,
          min: item.itemConfig.min,
          max: item.itemConfig.max,
          label: item.itemConfig.label,
          windowSize: item.itemConfig.windowSize,
        } as ITemplateItem;
      }),
    } as ITemplate;
  };

  const transferITemplateToDragItems = (template: ITemplate): IDragItem[] => {
    return template.itemsConfig.map((item) => {
      return {
        id: item?.id ?? Math.random().toString(),
        type: item.type,
        itemConfig: {
          requestSignalId: item.requestSignalId,
          requestSignals: item.requestSignals,
          colors: item.colors,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          title: item.title,
          interval: item.interval,
          trueLabel: item.trueLabel,
          falseLabel: item.falseLabel,
          unit: item.unit,
          during: item.during,
          min: item.min,
          max: item.max,
          label: item.label,
          windowSize: item.windowSize,
        },
      };
    });
  };

  return (
    <div
      className="dd_container"
      style={{
        backgroundColor: "#f8f8f8",
        backgroundImage:
          "linear-gradient(#e2e2e2 1px, transparent 1px), linear-gradient(90deg, #e2e2e2 1px, transparent 1px)",
      }}
    >
      <div className="dd_body">
        <div className="dd_drop_container" ref={ref}>
          <ConfigDropContainer
            banModify={mode === "COLLECTING"}
            items={dragItems}
            testConfig={testConfig}
            isReplayModal={isReplayModal}
            onLayoutChange={updateAllByLayout}
            updateDragItem={updateDragItem}
            handleUpdateData={handleUpdateData}
            fileHistory={undefined}
            netHistory={netDataRecorder}
          />
        </div>
        {renderManageButton()}
      </div>
    </div>
  );
};

const ReplaySearchModal = ({
  history,
  open,
  onFinished,
}: {
  history: IHistoryList;
  open: boolean;
  onFinished: (startTime?: number, endTime?: number, count?: number) => void;
}) => {
  const handleClose = () => {
    onFinished();
  };

  // 查询条件

  const [period, setPeriod] = useState<number[]>([
    new Date(history?.createdAt).getTime(),
    new Date(history?.updatedAt).getTime(),
  ]);
  const [count, setCount] = useState(1000);

  const debounceSetPeriod = debounce((value) => {
    setPeriod(value as number[]);
  });
  const changeParams = (period1: any, period2: any, count: any) => {
    console.log("0000");

    useParamsStore.setState({
      period1,
      period2,
      count,
    });
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={handleClose}
        onClose={handleClose}
        onOk={() => {
          console.log("状态", period[0], period[1], count);
          changeParams(period[0], period[1], count);
          onFinished(period[0], period[1], count);
        }}
        width={800}
      >
        <div style={{ marginTop: 20 }}>
          拖动选择搜索时间:
          <Slider
            range
            defaultValue={[
              new Date(history?.createdAt).getTime(),
              new Date(history?.updatedAt).getTime(),
            ]}
            min={new Date(history?.createdAt).getTime()}
            max={new Date(history?.updatedAt).getTime()}
            tooltip={{
              formatter: (value: number | number[] | undefined) => {
                if (typeof value === "number") {
                  return <div>{formatTime(value)}</div>;
                } else if (Array.isArray(value)) {
                  return (
                    <div>
                      {formatTime(value[0])} - {formatTime(value[1])}
                    </div>
                  );
                }
                return null;
              },
            }}
            onChange={(value) => {
              debounceSetPeriod(value);
            }}
          />
        </div>
        <div style={{ marginTop: 20 }}>
          <Space>
            <Input
              placeholder={"输入在该段时间内查询数量"}
              defaultValue={1000}
              onChange={(e) => {
                setCount(Number(e.target.value));
              }}
            />
          </Space>
        </div>
      </Modal>
    </>
  );
};

export default TestTemplateForConfig;
