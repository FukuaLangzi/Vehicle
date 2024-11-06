import * as echarts from "echarts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { IChartInterface } from "@/components/Charts/interface.ts";
import { ITimeData } from "@/views/demo/TestConfig/template.tsx";
import { mergeKArrays } from "@/utils";
import { Modal } from "antd";

interface ISeries {
  id: string;
  name: string;
  type: string;
  symbol: string;
  data: Array<number>[];
  color?: string;
}

const LinesChart: React.FC<IChartInterface> = (props) => {
  const {
    requestSignals,
    currentTestChartData,
    windowSize,
    colors,
    isReplayModal,
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

  // 选择区间
  const [startRange, setStartRange] = useState(-1);
  const [endRange, setEndRange] = useState(-1);

  // 中值滤波
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const medianFilter = (
    arr: { time: number; value: number }[],
    windowSize: number | string
  ): Array<[number, number]> => {
    let window =
      typeof windowSize === "string" ? parseInt(windowSize) : windowSize;
    if (isNaN(window) || window <= 2) {
      return arr.map((item) => [item.time, item.value]);
    }
    if (window % 2 === 0) {
      window += 1; // 确保窗口大小为奇数
    }

    if (!arr || arr.length === 0) return []; // 处理空数组情况
    const result = [];
    const halfWindow = Math.floor(window / 2);

    for (let i = 0; i < arr.length; i++) {
      if (i < halfWindow || i >= arr.length - halfWindow) {
        result.push([arr[i].time, arr[i].value]); // 边界处保持原值
      } else {
        const temp = arr
          .slice(i - halfWindow, i + halfWindow + 1)
          .map((item) => item.value);
        temp.sort((a, b) => a - b); // 排序
        result.push([arr[i].time, temp[Math.floor(window / 2)]]); // 获取中间值，格式为 [time, value]
      }
    }

    // result根据时间排序
    // result.sort((a, b) => a[0] - b[0]);

    return result;
  };

  // 让曲线更平滑的函数,取滤波后的值，然后根据时间戳的差值，取最接近的时间戳
  const smoothMedianFilter = (
    arr: { time: number; value: number }[],
    windowSize: number | string
  ): Array<[number, number]> => {
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
      smoothResult.push([time, result[i][1]]);
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

      // Update chart options
      const option = {
        xAxis: {
          type: "time",
          data: time,
        },
        series: dataRef.current,
      };
      chartRef.current?.setOption(option);
    },
    [requestSignals]
  );

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
          currentTestChartData
            .get(item.id)
            ?.map((item) => [item.time, item.value]) || [],
        color: colors ? colors[requestSignals.indexOf(item)] : undefined,
      };
    });
    // 截取时间 前length个
    xAxis.current = xAxis.current.slice(-length);
  }, [requestSignalIds, colors]);

  // 同步netWorkData
  useEffect(() => {
    if (currentTestChartData && !chartRef.current?.isDisposed()) {
      for (const [key] of currentTestChartData) {
        const array = currentTestChartData.get(key);
        const test = [];
        array.forEach((item: any) => {
          test.push({
            time: item.time,
            value: item.value.toFixed(6),
          });
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
                show: true,
                title: {
                  lineX: "框选计算",
                  clear: "关闭框选",
                },
              },
              saveAsImage: { show: true },
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
      console.log(params);
      const { data } = params;
      if (startRange === -1) {
        setStartRange(data[0]);
      } else if (endRange === -1) {
        setEndRange(data[0]);
      } else {
        setStartRange(data[0]);
        setEndRange(-1);
      }
      const option = {
        series: [
          {
            markLine: {
              data: [
                {
                  xAxis: startRange === -1 ? data[0] : startRange,
                  type: "time",
                  // 把时间戳转换为时间
                  label: {
                    formatter: (params) => {
                      return new Date(params.value).toLocaleString();
                    },
                  },
                },
                {
                  xAxis: endRange === -1 ? data[0] : endRange,
                  type: "time",
                  label: {
                    formatter: (params) => {
                      return new Date(params.value).toLocaleString();
                    },
                  },
                },
              ],
            },
          },
        ],
      };
      chartRef.current?.setOption(option);

      console.log(chartRef.current);
    });

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
          values[0].num;
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
  }, [startRange, endRange]);

  const isDuring = (time: number, timeOne: number, timeTwo: number) => {
    return (
      (time >= timeOne && time <= timeTwo) ||
      (time <= timeOne && time >= timeTwo)
    );
  };

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <LinesDataParsingModal
        source={
          startRange !== -1 && endRange !== -1
            ? dataRef.current.map((item) => {
                const result = {
                  name: item.name,
                  max: Math.max(
                    ...item.data
                      .filter((item) => isDuring(item[0], startRange, endRange))
                      .map((item) => item[1])
                  ),
                  min: Math.min(
                    ...item.data
                      .filter((item) => isDuring(item[0], startRange, endRange))
                      .map((item) => item[1])
                  ),
                  middle:
                    item.data
                      .filter((item) => isDuring(item[0], startRange, endRange))
                      .reduce((prev, current) => prev + current[1], 0) /
                    item.data.filter((item) =>
                      isDuring(item[0], startRange, endRange)
                    ).length,
                };
                console.log(result);
                return result;
              })
            : []
        }
        open={startRange !== -1 && endRange !== -1}
        startRange={startRange}
        endRange={endRange}
        onFinished={() => {
          setStartRange(-1);
          setEndRange(-1);
        }}
      />
    </div>
  );
};

export default LinesChart;

const LinesDataParsingModal = ({
  source,
  open,
  startRange,
  endRange,
  onFinished,
}: {
  source: {
    name: string;
    max: number;
    min: number;
    middle: number;
  }[];
  startRange: number;
  endRange: number;
  open: boolean;
  onFinished: () => void;
}) => {
  const handleClose = () => {
    onFinished();
  };

  const list = source.map((item, index) => {
    return (
      <div style={{ marginBottom: 20 }} key={index}>
        <p style={{ fontWeight: "bold", fontSize: 16 }}>{item.name}</p>
        <p style={{ fontSize: 14 }}>
          <span style={{ marginRight: 30 }}>最大值: {item.max}</span>
          <span style={{ marginRight: 30 }}>最小值: {item.min}</span>
          <span>均值: {item.middle}</span>
        </p>
      </div>
    );
  });

  return (
    <Modal open={open} onCancel={handleClose} onOk={handleClose}>
      <h3>
        {" "}
        分析结果：{new Date(startRange).toLocaleString()} -{" "}
        {new Date(endRange).toLocaleString()}{" "}
      </h3>
      {list.length ? (
        <div style={{ maxHeight: 600, overflowY: "scroll" }}>{list}</div>
      ) : (
        <div style={{ textAlign: "center" }}>无数据</div>
      )}
    </Modal>
  );
};
