import * as echarts from "echarts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { IChartInterface } from "@/components/Charts/interface.ts";
import { ITimeData } from "@/views/demo/TestConfig/template.tsx";
import { mergeKArrays } from "@/utils";
import { Modal, Input } from "antd";
import useParamsStore from "../../../store/store.ts";
import { updateData } from "@/apis/request/data.ts"; // 更新的api位置
interface ISeries {
  id: string;
  name: string;
  type: string;
  symbol: string;
  data: Array<number>[];
  color?: string;
  lineStyle?: any;
}

const LinesChart: React.FC<IChartInterface> = (props) => {
  const {
    requestSignals,
    currentTestChartData,
    windowSize,
    colors,
    isReplayModal,
    lineTypeCode,
    handleUpdateData,
  } = props;
  const chartRef = useRef<echarts.ECharts | null>();
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const xAxis = useRef<string[]>([]);
  const dataRef = useRef<ISeries[]>(
    requestSignals.map((item, index) => {
      return {
        id: item.id,
        name: item.name,
        type: "line",
        data: [],
        color: colors ? colors[index] : undefined,
        symbol: "circle",
      };
    })
  );

  // 修改数据的组件的状态
  const [editOpenState, seteditOpenState] = useState<boolean>(false);

  // 中值滤波
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const medianFilter = (
    arr: { id: number; time: number; value: number }[],
    windowSize: number | string
  ): Array<[number, number, number]> => {
    let window =
      typeof windowSize === "string" ? parseInt(windowSize) : windowSize;
    if (isNaN(window) || window <= 2) {
      return arr.map((item) => [item.time, item.value, item.id]);
    }
    if (window % 2 === 0) {
      window += 1; // 确保窗口大小为奇数
    }

    if (!arr || arr.length === 0) return []; // 处理空数组情况
    const result = [];
    const halfWindow = Math.floor(window / 2);

    for (let i = 0; i < arr.length; i++) {
      if (i < halfWindow || i >= arr.length - halfWindow) {
        result.push([arr[i].time, arr[i].value, arr[i].id]); // 边界处保持原值
      } else {
        const temp = arr
          .slice(i - halfWindow, i + halfWindow + 1)
          .map((item) => item.value);
        temp.sort((a, b) => a - b); // 排序
        result.push([arr[i].time, temp[Math.floor(window / 2)], arr[i].id]); // 获取中间值，格式为 [time, value]
      }
    }

    // result根据时间排序
    // result.sort((a, b) => a[0] - b[0]);

    return result;
  };

  // 让曲线更平滑的函数,取滤波后的值，然后根据时间戳的差值，取最接近的时间戳
  const smoothMedianFilter = (
    arr: { idui: number; time: number; value: number }[],
    windowSize: number | string
  ): Array<[number, number, number]> => {
    const result = medianFilter(arr, windowSize);
    // 小于400个点不进行平滑，因为可能会有误差
    if (result.length < 400) {
      return result;
    }
    const smoothResult = [];
    const length = result.length;
    let timeStep = (result[length - 1][0] - result[0][0]) / (length + 1);
    // 取1、10、100、1000中最接近的一个
    if (timeStep < 1) {
      timeStep = 1;
    }
    timeStep = Math.pow(10, Math.round(Math.log10(timeStep)));
    timeStep = Math.floor(timeStep);
    //最后一个减去倒数第二个
    // 矣最后一个时间为基准，前面的时间递减
    let time = result[length - 1][0];
    for (let i = length - 1; i >= 0; i--) {
      smoothResult.push([time, result[i][1], result[i][2]]);
      time -= timeStep;
    }
    return smoothResult;
  };

  const pushData = useCallback(
    (data: Map<string, ITimeData[]>) => {
      if (!requestSignals || requestSignals.length === 0) {
        return;
      }

      if (dataRef.current.length === 0) {
        requestSignals.forEach((item, index) => {
          dataRef.current.push({
            id: item.id,
            name: item.name + "/" + item.dimension,
            type: "line",
            symbol: "circle",
            data: [],
            color: colors ? colors[index] : undefined,
          });
        });
      }

      // 把每个信号的数据push到对应的dataRef中, 同时进行滤波、修改时间戳等操作
      requestSignals.forEach((signal) => {
        const signalData = data.get(signal.id);
        if (signalData) {
          // TODO 在这里添加中值滤波、平滑滤波等操作
          dataRef.current.forEach((item) => {
            if (item.id === signal.id) {
              const datas = smoothMedianFilter(signalData, windowSize);
              item.data = datas.slice(0, datas.length - 100);
            }
          });
        }
      });

      // 合并时间
      const time = mergeKArrays(
        requestSignals.map((signal) => {
          return (
            dataRef.current
              .find((item) => item.id === signal.id)
              ?.data.map((item) => item[0]) || []
          );
        })
      );
      // 更新之前加上虚线
      dataRef.current = dataRef.current.map((item) => {
        let lineStyle: { type: string };
        if (lineTypeCode === 1) {
          // 实线
          lineStyle = {
            type: "solid",
          };
        } else if (lineTypeCode === 2) {
          // 虚线
          lineStyle = {
            type: "dashed",
          };
        } else {
          //点线
          lineStyle = {
            type: "dotted",
          };
        }
        return {
          ...item,
          lineStyle,
        };
      });
      // Update chart options

      const option = {
        xAxis: {
          type: "time",
          data: time,
        },
        series: dataRef.current,
      };
      chartRef.current?.setOption(option);
      updateDataFn();
    },
    [requestSignals]
  );
  // 获取参数数据
  const period1 = useParamsStore((state) => state.period1);
  const period2 = useParamsStore((state) => state.period2);
  const count = useParamsStore((state) => state.count);
  // 当前的节点值
  const [editInitValue, seteditInitValue] = useState();
  // 当前的节点id
  const [editID, seteditID] = useState();
  // 修改的节点值
  const [newEditValue, setnewEditValue] = useState<string | undefined>();
  // 更新数据的函数
  const updateDataFn = () => {
    // 在修改后更新数据
    if (editID && newEditValue) {
      updateData(String(editID), Number(newEditValue));
      handleUpdateData(period1, period2, count);
      setnewEditValue(undefined);
    }
  };
  const requestSignalIds = requestSignals.map((signal) => signal.id).join("");

  useEffect(() => {
    // 如果需要采集的信号变了,更新dataref，并且清空time
    let length = 0;
    dataRef.current = requestSignals.map((item) => {
      length = currentTestChartData.get(item.id)?.length || 0;
      return {
        id: item.id,
        name:
          item.dimension === "/" ? item.name : item.name + "/" + item.dimension,
        type: "line",
        symbol: "circle",
        data:
          currentTestChartData.get(item.id)?.map((item) => {
            return [item.id, item.time, item.value];
          }) || [],
        color: colors ? colors[requestSignals.indexOf(item)] : undefined,
      };
    });
    // 截取时间 前length个
    xAxis.current = xAxis.current.slice(-length);
  }, [requestSignalIds, colors, requestSignals, currentTestChartData]);

  // 同步netWorkData
  useEffect(() => {
    if (currentTestChartData && !chartRef.current?.isDisposed()) {
      for (const [key] of currentTestChartData) {
        const array = currentTestChartData.get(key);
        const test = [];
        array.forEach((item: any) => {
          if (item.value !== undefined && item.value !== null) {
            const val =
              typeof item.value === "string"
                ? item.value
                : item.value.toFixed(6);
            test.push({
              id: item.id,
              time: item.time,
              value: val,
            });
          }
        });
        currentTestChartData.set(key, test);
      }
      pushData(currentTestChartData);
    }
  }, [pushData, requestSignals, currentTestChartData]);

  useEffect(() => {
    chartRef.current = echarts.init(chartContainerRef.current);
    const option = isReplayModal
      ? {
          dataZoom: [
            {
              type: "slider",
              show: true,
              xAxisIndex: [0],
              start: 1,
              end: 100,
            },
            {
              type: "inside",
              xAxisIndex: [0],
              start: 1,
              end: 100,
            },
            {
              type: "inside",
              orient: "vertical",
            },
          ],
          toolbox: {
            show: true,
            feature: {
              brush: {
                title: {
                  lineX: "框选计算",
                  clear: "关闭框选",
                },
              },
            },
            top: 0,
            right: 15,
            itemSize: 20,
          },
          brush: {
            toolbox: ["lineX", "clear"],
            xAxisIndex: 0,
            brushStyle: {
              borderWidth: 1,
              color: "rgba(120,140,180,0.2)",
              borderColor: "rgba(120,140,180,0.8)",
            },
          },
          tooltip: {
            trigger: "axis",
            formatter: function (params: any) {
              const dom = params
                .map((item: any) => {
                  return `<span style="display:flex; justify-content:space-between"><div>${
                    item.marker + item.seriesName
                  }</div><div><b>${item.data[1]}</b></div></span>`;
                })
                .join("");
              const result =
                `<span style="margin-right: 80px;">${params[0].axisValueLabel}</span>` +
                dom;
              return result;
            },
          },
          legend: {
            data: dataRef.current.map((item) => item.name),
          },
          grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
          },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: xAxis.current,
          },
          yAxis: {
            type: "value",
          },
          series: [],
        }
      : {
          dataZoom: [
            {
              type: "slider",
              show: true,
              xAxisIndex: [0],
              start: 1,
              end: 100,
            },
            {
              type: "inside",
              xAxisIndex: [0],
              start: 1,
              end: 100,
            },
            {
              type: "inside",
              orient: "vertical",
            },
          ],
          tooltip: {
            trigger: "axis",
            formatter: function (params: any) {
              const dom = params
                .map((item: any) => {
                  return `<span style="display:flex; justify-content:space-between"><div>${
                    item.marker + item.seriesName
                  }</div><div><b>${item.data[1]}</b></div></span>`;
                })
                .join("");
              const result =
                `<span style="margin-right: 80px;">${params[0].axisValueLabel}</span>` +
                dom;
              return result;
            },
          },
          legend: {
            data: dataRef.current.map((item) => item.name),
          },
          grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
          },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: xAxis.current,
          },
          yAxis: {
            type: "value",
          },
          series: [],
        };
    const resizeObserver = new ResizeObserver(() => {
      chartRef.current && chartRef.current.resize();
    });
    chartContainerRef.current &&
      resizeObserver.observe(chartContainerRef.current);
    chartRef.current?.setOption(option);

    return () => {
      resizeObserver.disconnect();
      chartRef.current?.dispose();
    };
  }, [requestSignals.length]);

  useEffect(() => {
    chartRef.current?.on("click", (params) => {
      seteditInitValue(params.data[1]);
      seteditID(params.data[2]);
      isReplayModal && seteditOpenState(true);
    });
    // 选择区间的监听事件
    let rangeStore = [0, 0];
    chartRef.current?.on("brushSelected", (params: any) => {
      if (params.batch.length < 1 || params.batch[0].areas.length < 1) {
        return;
      }

      const infoGroup = [];
      const textGroup = [];
      const group = {};
      const range = params.batch[0].areas[0].coordRange;
      const startDate = new Date(range[0]),
        endDate = new Date(range[range.length - 1]);
      const timeData =
        startDate.toLocaleString() + "至" + endDate.toLocaleString();
      range[range.length - 1] = range[range.length - 1] + 1;

      if (JSON.stringify(rangeStore) === JSON.stringify(range) || !range[0]) {
        chartRef.current?.setOption({
          title: { text: "", backgroundColor: "transparent" },
        });
        return;
      }
      rangeStore = range;
      //获取区域范围内的数据
      for (let sIdx = 0; sIdx < params.batch[0].selected.length; sIdx++) {
        const name = params.batch[0].selected[sIdx].seriesName;
        const newArr = chartRef.current?.getOption().series[sIdx].data;
        newArr.forEach((item) => {
          if (item[0] > range[0] && item[0] < range[1]) {
            if (!group[name]) {
              group[name] = [];
            }
            group[name].push({
              time: item[0],
              value: item[1],
            });
          }
        });
      }
      //计算展示的值

      for (const key in group) {
        let sum = 0,
          average = 0,
          max = 0,
          min = Infinity;
        group[key].forEach((x) => {
          if (x) sum += Number(x.value);
          if (x.value > max) max = Number(x.value);
          if (x.value < min) min = Number(x.value);
        });
        average = sum / group[key].length;
        infoGroup.push({
          [key]: {
            sum: sum.toFixed(2),
            max: max.toFixed(2),
            min: min.toFixed(2),
            average: average.toFixed(2),
            num: group[key].length,
          },
        });
      }
      for (const key in infoGroup) {
        const keys = Object.keys(infoGroup[key]);
        const values = Object.values(infoGroup[key]) as any;
        const str =
          "名称:" +
          keys[0] +
          "  最大值:" +
          values[0].max +
          "  最小值:" +
          values[0].min +
          "  均值:" +
          values[0].average;
        textGroup.push(str);
      }
      const info = "时间:" + timeData + "\n" + textGroup.join("\n");
      chartRef.current?.setOption({
        title: {
          backgroundColor: "#333",
          text: info,
          bottom: 0,
          right: "20%",
          width: 100,
          textStyle: {
            fontSize: 12,
            color: "#fff",
          },
        },
      });
    });

    return () => {
      chartRef.current?.off("click");
    };
  }, [editOpenState]);

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <LinesDataParsingModal
        open={editOpenState}
        initValue={editInitValue}
        setnewEditValue={setnewEditValue}
        onFinished={() => {
          seteditOpenState(false);
          updateDataFn();
        }}
      />
    </div>
  );
};

export default LinesChart;

const LinesDataParsingModal = ({
  open,
  onFinished,
  setnewEditValue,
  initValue,
}: {
  open: boolean;
  onFinished: () => void;
  initValue: any;
  setnewEditValue: any;
}) => {
  const handleClose = () => {
    onFinished();
    setnowvalue(undefined);
  };
  const handleChange = (e: any) => {
    setnewEditValue(e.target.value);
    setnowvalue(e.target.value);
  };
  const [nowvalue, setnowvalue] = useState(undefined);
  return (
    <Modal open={open} onCancel={handleClose} onOk={handleClose}>
      当前的数据：{initValue}
      <Input
        placeholder="Basic usage"
        value={nowvalue}
        onChange={handleChange}
      />
    </Modal>
  );
};
