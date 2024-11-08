import {
  DELETE_SUCCESS_MSG,
  FAIL_CODE,
  SEARCH_FAIL_MSG,
  SEARCH_SUCCESS_MSG,
  SUCCESS_CODE,
  UPDATE_FAIL_MSG,
  UPDATE_SUCCESS_MSG,
} from "../constants";
import { Context } from "koa";
import { IResBody } from "../types";
import dataService from "../service/DataService";

class DataController {
  async getTargetData(context: Context) {
    const { belongId, name, startTime, endTime, minValue, maxValue } =
      context.request.body;
    const res = await dataService.getTargetData(
      belongId,
      name,
      startTime,
      endTime,
      minValue,
      maxValue
    );

    res &&
      ((context.body as IResBody) = {
        code: SUCCESS_CODE,
        msg: SEARCH_SUCCESS_MSG,
        data: res,
      });
    !res &&
      ((context.body as IResBody) = {
        code: FAIL_CODE,
        msg: SEARCH_FAIL_MSG,
        data: null,
      });
  }

  async getDataMaxMinMiddle(context: Context) {
    const belongId = context.params.belongId;
    const res = await dataService.getDataMaxMinMiddle(belongId);

    res &&
      ((context.body as IResBody) = {
        code: SUCCESS_CODE,
        msg: SEARCH_SUCCESS_MSG,
        data: res,
      });
    !res &&
      ((context.body as IResBody) = {
        code: FAIL_CODE,
        msg: SEARCH_FAIL_MSG,
        data: null,
      });
  }

  async updateData(context: Context) {
    const { id, value } = context.request.body;
    const res = await dataService.updateData(id, value);

    res &&
      ((context.body as IResBody) = {
        code: SUCCESS_CODE,
        msg: UPDATE_SUCCESS_MSG,
        data: res,
      });
    !res &&
      ((context.body as IResBody) = {
        code: FAIL_CODE,
        msg: UPDATE_FAIL_MSG,
        data: null,
      });
  }

  async deleteData(context: Context) {
    const { targetIds } = context.request.body;
    const res = await dataService.deleteData(targetIds);
    console.log(res);

    res &&
      ((context.body as IResBody) = {
        code: SUCCESS_CODE,
        msg: DELETE_SUCCESS_MSG,
        data: res,
      });
    !res &&
      ((context.body as IResBody) = {
        code: FAIL_CODE,
        msg: "删除失败",
        data: null,
      });
  }

  async fgetSampledData(context: Context) {
    const { belongId, startTime, endTime, count } = context.request.body;
    const res = await dataService.getSampledDataForSignals(
      belongId,
      startTime,
      endTime,
      count
    );

    res &&
      ((context.body as IResBody) = {
        code: SUCCESS_CODE,
        msg: SEARCH_SUCCESS_MSG,
        data: res,
      });
    !res &&
      ((context.body as IResBody) = {
        code: FAIL_CODE,
        msg: SEARCH_FAIL_MSG,
        data: null,
      });
  }
}

export default new DataController();
