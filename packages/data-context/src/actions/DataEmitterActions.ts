import pDefer from 'p-defer'
import { EventEmitter } from 'stream'

import type { DataContext } from '../DataContext'

abstract class DataEmitterEvents {
  protected pub = new EventEmitter()

  /**
   * Emitted when we have logged in / logged out of the application
   */
  authChange () {
    this._emit('authChange')
  }

  /**
   * Emitted when we have modified part of the backend and want to show
   * a notification to possibly restart the app
   */
  devChange () {
    this._emit('devChange')
  }

  browserStatusChange () {
    this._emit('browserStatusChange')
  }

  private _emit <Evt extends keyof DataEmitterEvents> (evt: Evt, ...args: Parameters<DataEmitterEvents[Evt]>) {
    this.pub.emit(evt, ...args)
  }
}
export class DataEmitterActions extends DataEmitterEvents {
  constructor (private ctx: DataContext) {
    super()
  }

  /**
   * Broadcasts a signal to the "app" via Socket.io, typically used to trigger
   * a re-query of data on the frontend
   */
  toApp (...args: any[]) {
    this.ctx.coreData.servers.appSocketServer?.emit('data-context-push', ...args)
  }

  /**
   * Broadcasts a signal to the "launchpad" (Electron GUI) via Socket.io,
   * typically used to trigger a re-query of data on the frontend
   */
  toLaunchpad (...args: any[]) {
    this.ctx.coreData.servers.gqlSocketServer?.emit('data-context-push', ...args)
  }

  /**
   * GraphQL Subscriptions use the AsyncIterator protocol for notifying
   * of updates which trigger re-execution on the client.
   * However the native syntax for async iteration: async function* () {...}
   * currently has no means for cancelling the iterator (as far as I've read):
   *   https://github.com/tc39/proposal-async-iteration/issues/126
   *
   * The graphql-ws library does properly handle the iteration, however it
   * requires that we use the raw protocol, which we have below. We assume that
   * when subscribing, we want to execute the operation to get the up-to-date initial
   * value, and then we keep a deferred object, resolved when the given emitter is fired
   */
  subscribeTo (evt: keyof DataEmitterEvents, sendInitial = true): AsyncIterator<any> {
    let hasSentInitial = false
    let dfd: pDefer.DeferredPromise<any> | undefined

    function subscribed (val: any) {
      dfd?.resolve(val)
    }
    this.pub.on(evt, subscribed)

    const iterator = {
      async next () {
        if (!hasSentInitial && sendInitial) {
          hasSentInitial = true

          return { done: false, value: {} }
        }

        dfd = pDefer()

        return { done: false, value: await dfd.promise }
      },
      return: async () => {
        this.pub.off(evt, subscribed)
        dfd = undefined

        return { done: true, value: undefined }
      },

      [Symbol.asyncIterator] () {
        return iterator
      },
    }

    return iterator
  }
}
