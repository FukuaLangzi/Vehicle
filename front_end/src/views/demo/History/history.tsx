import {
  Button,
  Card,
  Input,
  message,
  Modal,
  Space,
  Table,
  TableProps,
  Select,
  DatePicker,
} from "antd";
import React, { useEffect, useState } from "react";
import {
  deleteTestsHistory,
  getTestsHistory,
  getTestsHistoryById,
} from "@/apis/request/testhistory.ts";
import { FAIL_CODE, SUCCESS_CODE } from "@/constants";
import { confirmDelete, debounce, formatTime } from "@/utils";
import Search from "antd/es/input/Search";
import { BASE_URL } from "@/apis/url/myUrl.ts";
import { ITestConfig } from "@/apis/standard/test.ts";
import {
  getDataMaxMinMiddle,
  searchForTargetData,
} from "@/apis/request/data.ts";
import { TableRowSelection } from "antd/es/table/interface";
import { deleteData, updateData } from "@/apis/request/data.ts"; // 更新的api位置
// import dayjs from 'dayjs';
const { RangePicker } = DatePicker;

export interface IHistoryList {
  id?: number;
  fatherConfigName: string;
  vehicleName: string;
  path: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  testConfig: ITestConfig;
}

const HistoryData = () => {
  const [historyDataStore, setHistoryDataStore] = React.useState<
    IHistoryList[]
  >([]);
  const [historyData, setHistoryData] = React.useState<IHistoryList[]>([]);
  // const [dataAnalysisVisible, setDataAnalysisVisible] = React.useState<boolean>(false)
  const [belongId, setBelongId] = React.useState<string>(undefined);

  const [history, setHistory] = useState(undefined);
  const [dataParsing, setDataParsing] = useState<
    {
      name: string;
      max: number;
      min: number;
      middle: number;
    }[]
  >([]);
  const [openDataParsing, setOpenDataParsing] = useState(false);
  const [openDetailSearch, setOpenDetailSearch] = useState(false);
  const handleCloseParsing = () => {
    setOpenDataParsing(false);
  };
  const handleCloseDetailSearch = () => {
    setOpenDetailSearch(false);
  };

  useEffect(() => {
    getTestsHistoryById(Number(belongId)).then((res) => {
      if (res.code === SUCCESS_CODE) {
        setHistory(res.data);
      } else {
        setHistory(null);
      }
    });

    getDataMaxMinMiddle(Number(belongId)).then((res) => {
      if (res.code === SUCCESS_CODE) {
        setDataParsing(res.data);
      } else {
        setDataParsing(null);
      }
    });
  }, [belongId]);

  const columns: TableProps<IHistoryList>["columns"] = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: "所属配置名称",
      dataIndex: "fatherConfigName",
      key: "fatherConfigName",
    },
    {
      title: "测试车辆",
      dataIndex: "vehicleName",
      key: "vehicleName",
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: "最后更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: "操作",
      key: "action",
      render: (record) => (
        <Space>
          {/*<a onClick={() => {*/}
          {/*  setDataAnalysisVisible(!dataAnalysisVisible);*/}
          {/*  setBelongId(record.id.toString())*/}
          {/*}}>数据分析</a>*/}
          <a
            onClick={() => {
              setBelongId(record.id.toString());
              setOpenDetailSearch(true);
            }}
          >
            查询
          </a>
          {/*<a onClick={async () => {*/}
          {/*  setBelongId(record.id.toString())*/}
          {/*  getTestsHistoryById(Number(belongId)).then(res => {*/}
          {/*    if (res.code === SUCCESS_CODE) {*/}
          {/*      setHistory(res.data)*/}
          {/*    } else {*/}
          {/*      setHistory(null)*/}
          {/*    }*/}
          {/*  }).then(() => {*/}
          {/*    setOpenDataParsing(true)*/}
          {/*  })*/}
          {/*}}>*/}
          {/*  分析*/}

          {/*</a>*/}
          <a
            onClick={() => {
              setBelongId(record.id.toString());
              window.open(`/test-template-for-config?historyId=${history.id}`);
            }}
          >
            回放
          </a>
          {record.path === "" ? null : (
            <a href={`${BASE_URL + record.path}`} download={true}>
              导出
            </a>
          )}
          <a onClick={() => deleteHistory(record.id!)}>删除</a>
        </Space>
      ),
    },
  ];

  const fetchHistoryData = () => {
    getTestsHistory().then((res) => {
      if (res.code === FAIL_CODE) {
        message.error("获取历史数据失败" + res.msg);
        return;
      }
      setHistoryData(res.data);
      setHistoryDataStore(res.data);
    });
  };

  const deleteHistory = (id: number) => {
    confirmDelete() &&
      deleteTestsHistory(id).then((res) => {
        if (res.code === FAIL_CODE) {
          message.error("删除失败," + res.msg);
          return;
        }
        fetchHistoryData();
      });
  };

  useEffect(() => {
    fetchHistoryData();
  }, []);

  return (
    <Card
      title="历史数据"
      extra={
        <Space>
          <Search
            placeholder="搜索"
            onSearch={(value) => {
              setHistoryData(
                historyDataStore.filter(
                  (item) =>
                    item.fatherConfigName.includes(value) ||
                    item.createdAt.toString().includes(value) ||
                    item.vehicleName.toString().includes(value)
                )
              );
            }}
          />
          <Space />
          <Button onClick={fetchHistoryData}>刷新</Button>
        </Space>
      }
      style={{
        height: "100vh",
        overflow: "scroll",
      }}
    >
      <Table columns={columns} dataSource={historyData} rowKey="id" />

      <DetailSearchModal
        history={history}
        open={openDetailSearch}
        onFinished={handleCloseDetailSearch}
      />
      <DataParsingModal
        source={dataParsing}
        open={openDataParsing}
        onFinished={handleCloseParsing}
      />
      {/*{dataAnalysisVisible?<DataAnalysis belongid={belongId}></DataAnalysis>:<>6</>}*/}
    </Card>
  );
};

export const DataParsingModal = ({
  source,
  open,
  onFinished,
}: {
  source: {
    name: string;
    max: number;
    min: number;
    middle: number;
  }[];
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
      分析结果
      {list.length ? (
        <div style={{ maxHeight: 600, overflowY: "scroll" }}>{list}</div>
      ) : (
        <div style={{ textAlign: "center" }}>无数据</div>
      )}
    </Modal>
  );
};

//------------------------查询弹出框开始---------------------------
const DetailSearchModal = ({
  history,
  open,
  onFinished,
}: {
  history: IHistoryList;
  open: boolean;
  onFinished: () => void;
}) => {
  const handleClose = () => {
    onFinished();
  };

  // 查询功能
  const [searchCriteria, setSearchCriteria] = useState({
    name: "",
    startTime: new Date(history?.createdAt).getTime(),
    endTime: new Date(history?.updatedAt).getTime(),
    minValue: -1000,
    maxValue: 1000,
  });
  const startSearch = (name: string) => {
    if (!rangePickerVisible) {
      message.error("必选选择时间范围");
      return;
    }
    message.loading("正在检索数据");
    searchForTargetData(
      history.id,
      name,
      searchCriteria.startTime,
      searchCriteria.endTime,
      searchCriteria.minValue,
      searchCriteria.maxValue
    ).then((res) => {
      if (res.code === SUCCESS_CODE) {
        setSearchResultArr(res.data);
      }
      message.destroy();
    });
  };
  interface DataType {
    id: number;
    key: string;
    time: number;
    value: number;
  }
  const [searchResultArr, setSearchResultArr] = useState<DataType[]>(undefined);
  const searchResultColumns: TableProps<DataType>["columns"] = [
    {
      key: "time",
      title: "时间",
      dataIndex: "time",
      render: (text) => {
        return formatTime(text);
      },
    },
    {
      key: "value",
      title: "结果",
      dataIndex: "value",
    },
  ];

  //时间筛选功能
  const [rangePickerVisible, setRangePickerVisible] = useState<boolean>(false);
  const debounceSetPeriod = debounce((value) => {
    setSearchCriteria({
      ...searchCriteria,
      startTime: value[0],
      endTime: value[1],
    });
  });

  //删除功能
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
    setSelectedRowKeys(newSelectedRowKeys);
  };
  const rowSelection: TableRowSelection<DataType> = {
    selectedRowKeys,
    onChange: onSelectChange,
  };
  const handleSearchResultDelete = () => {
    if (!selectedRowKeys.length) {
      message.error("请选中要删除的项");
      return;
    }
    const ids: string[] = selectedRowKeys as string[];
    deleteData(ids)
      .then((res) => {
        if (res.code === SUCCESS_CODE) {
          message.success(res.msg);
          startSearch(searchCriteria.name);
        } else {
          message.error("删除失败" + res.msg);
        }
      })
      .catch(() => {
        message.error("删除失败");
      });
  };

  //编辑功能
  const [updateDataVisible, setUpdateDataVisible] = useState<boolean>(false);
  const [nowUpdateDataValue, setNowUpdateDataValue] = useState<string>();
  const getValueById = (id: number) => {
    const nowRow = searchResultArr.filter((item) => item.id == id)[0];
    return nowRow.value;
  };
  const handleSearchResultEdit = () => {
    if (selectedRowKeys.length == 0) {
      message.error("选择要编辑的项");
      return;
    }
    if (selectedRowKeys.length > 1) {
      message.error("只能编辑一项");
      return;
    }
    setNowUpdateDataValue(
      getValueById(selectedRowKeys[0] as number).toString()
    );
    setUpdateDataVisible(true);
    // const ids:string[]=selectedRowKeys as string[]
    // setNowUpdateDataId(ids[0])
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={handleClose}
        footer={<Button onClick={handleClose}>取消</Button>}
        width={800}
      >
        {/*搜索栏*/}
        <Space>
          输入搜索名称:
          <Select
            defaultValue="请输入"
            style={{ width: 200 }}
            onChange={(value) => {
              setSearchCriteria({ ...searchCriteria, name: value });
            }}
            options={history?.testConfig.configs[0].projects
              .map((project) => {
                return project.indicators.map((indicator) => {
                  return {
                    value: indicator.signal.name,
                    label: indicator.name,
                  };
                });
              })
              .flat(2)}
          />{" "}
          <Button
            type={"primary"}
            onClick={() => {
              if (!searchCriteria.name) {
                message.error("请输入信号名称");
                return;
              }
              // searchForSuitAbleName(searchCriteria.name)
              startSearch(searchCriteria.name);
            }}
          >
            开始搜索
          </Button>
        </Space>
        {/*时间选择栏*/}
        <div style={{ marginTop: 20 }}>
          {/*拖动选择搜索时间:*/}
          {/*<Slider range*/}
          {/*        defaultValue={[(new Date(history?.createdAt)).getTime(), (new Date(history?.updatedAt)).getTime()]}*/}
          {/*        min={(new Date(history?.createdAt)).getTime()}*/}
          {/*        max={(new Date(history?.updatedAt)).getTime()}*/}
          {/*        tooltip={{*/}
          {/*          formatter: (value: number | number[] | undefined) => {*/}
          {/*            if (typeof value === 'number') {*/}
          {/*              return <div>{formatTime(value)}</div>;*/}
          {/*            } else if (Array.isArray(value)) {*/}
          {/*              return <div>{formatTime(value[0])} - {formatTime(value[1])}</div>*/}
          {/*            }*/}
          {/*            return null;*/}
          {/*          }*/}
          {/*        }}*/}
          {/*        onChange={(value) => {*/}
          {/*          debounceSetPeriod(value)*/}
          {/*        }}*/}
          {/*/>*/}

          <Space>
            <RangePicker
              showTime={{
                format: "HH:mm：ss",
              }}
              format="YYYY-MM-DD HH:mm:ss"
              // minDate={dayjs((new Date(history?.createdAt)).toLocaleString(),'YYYY-MM-DD HH:mm:ss')}
              // maxDate={dayjs((new Date(history?.updatedAt)).toLocaleString(),'YYYY-MM-DD HH:mm:ss')}
              // defaultValue={[dayjs(((new Date()).toLocaleString()), 'YYYY-MM-DD HH:mm:ss'), dayjs(((new Date()).toLocaleString()),'YYYY-MM-DD HH:mm:ss')]}
              onChange={(value, dateString) => {
                if (value == null) {
                  setRangePickerVisible(false);
                } else {
                  setRangePickerVisible(true);
                }
                const timestamps = dateString.map((date) => {
                  const dateObj = new Date(date);
                  return dateObj.getTime();
                });
                debounceSetPeriod(timestamps);
              }}
            />
          </Space>
        </div>
        {/*最大最小值筛选，删除，编辑按钮*/}
        <div style={{ marginTop: 20, marginBottom: 8 }}>
          <Space>
            <Input
              placeholder={"最小值"}
              defaultValue={searchCriteria.minValue}
              onChange={(e) => {
                setSearchCriteria({
                  ...searchCriteria,
                  minValue: Number(e.target.value),
                });
              }}
            />
            <Input
              placeholder={"最大值"}
              defaultValue={searchCriteria.maxValue}
              onChange={(e) => {
                setSearchCriteria({
                  ...searchCriteria,
                  maxValue: Number(e.target.value),
                });
              }}
            />

            <Button onClick={handleSearchResultDelete} style={{ color: "red" }}>
              删除
            </Button>
            <Button
              onClick={() => {
                handleSearchResultEdit();
              }}
            >
              编辑
            </Button>
            {updateDataVisible ? (
              <>
                <Input
                  placeholder={`请输入新的值`}
                  defaultValue={nowUpdateDataValue.toString()}
                  onChange={(e) => {
                    setNowUpdateDataValue(e.target.value);
                  }}
                ></Input>
                <Button
                  onClick={() => {
                    updateData(
                      selectedRowKeys[0] as string,
                      Number(nowUpdateDataValue)
                    )
                      .then((res) => {
                        if (res.code === SUCCESS_CODE) {
                          message.success("更改成功");
                          setUpdateDataVisible(false);
                          startSearch(searchCriteria.name);
                        } else {
                          message.error("更改失败", res.msg);
                        }
                      })
                      .catch((err) => {
                        message.error(err);
                      });
                  }}
                >
                  确认
                </Button>
              </>
            ) : (
              <></>
            )}
          </Space>
        </div>
        {/*数据表格显示*/}
        <Table
          columns={searchResultColumns}
          rowSelection={rowSelection}
          dataSource={searchResultArr}
          rowKey={(record) => `${record.id}`}
        ></Table>
      </Modal>
    </>
  );
};
//-------------------------查询弹出框结束----------------------------

export default HistoryData;
