/*
 * @Author: Alex Sorafumo
 * @Date:   2017-05-02 10:47:09
 * @Last Modified by:   Alex Sorafumo
 * @Last Modified time: 2017-05-02 10:51:11
 */

import { EngineModule } from './module.class';
import { SystemsService } from '../systems.service';

export class EngineSystem {
    public id: string;
    public service: SystemsService;
    public modules: { [name: string]: EngineModule } = {};
    public exists = true;

    constructor(srv: SystemsService, sys_id: string) {
        this.service = srv;
        this.id = sys_id;
    }

    /**
     * Gets the module with the given id and index
     * @param id Module name
     * @param index Index of module in system
     * @return  Matched module or null
     */
    public get(id: string, index: number | string = 1): EngineModule {
        if (id && id.indexOf('_') >= 0) {
            const parts = id.split('_');
            const tmp_index = parts.slice(-1)[0];
            if (!isNaN(+tmp_index)) {
                id = parts.slice(0, parts.length - 1).join('_');
                index = tmp_index;
            }
        }
        if (!index) { index = 1; }
        const name = `${id}_${index}`;
        if (this.modules[name]) {
            return this.modules[name];
        }
        const mod = new EngineModule(this.service, this, id, +index);
        this.modules[name] = mod;
        return mod;
    }

    /**
     * Rebinds all bound status variables on existing modules in the system
     */
    public rebind() {
        for (const id in this.modules) {
            if (this.modules.hasOwnProperty(id) && this.modules[id]) {
                this.modules[id].rebind();
            }
        }
    }

}