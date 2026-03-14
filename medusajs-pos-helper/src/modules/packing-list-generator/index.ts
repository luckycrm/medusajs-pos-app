import PackingListGeneratorService from "./service"
import { Module } from "@medusajs/framework/utils"

export const PACKING_LIST_MODULE = "packingListGeneratorService"

export default Module(PACKING_LIST_MODULE, {
  service: PackingListGeneratorService,
})