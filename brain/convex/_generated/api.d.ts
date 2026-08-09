/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as epcr from "../epcr.js";
import type * as events from "../events.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_validators from "../lib/validators.js";
import type * as patientState from "../patientState.js";
import type * as sbar from "../sbar.js";
import type * as scribe from "../scribe.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  epcr: typeof epcr;
  events: typeof events;
  "lib/llm": typeof lib_llm;
  "lib/validators": typeof lib_validators;
  patientState: typeof patientState;
  sbar: typeof sbar;
  scribe: typeof scribe;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
