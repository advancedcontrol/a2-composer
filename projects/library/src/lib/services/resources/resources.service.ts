/**
 * @Author: Alex Sorafumo
 * @Date:   19/10/2016 10:47 AM
 * @Email:  alex@yuion.net
 * @Filename: resources.service.ts
 * @Last modified by:   Alex Sorafumo
 * @Last modified time: 31/01/2017 3:06 PM
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { log, error } from '../../settings';
import { CommsService } from '../auth/comms.service';
import { COMMON } from './common';
import { ResourceFactory } from './resource-factory.class';

@Injectable({
    providedIn: 'root'
})
export class ResourcesService {
    public authLoaded: boolean = false;
    private model: { [name: string]: any } = {};
    private factories: { [name: string]: ResourceFactory }; // key, value map of factories
    private url: string;
    private mock: boolean = false;

    constructor(public http: CommsService, private http_unauth: HttpClient) {
        this.http.reinitAuth((state) => {
            if (state) {
                this.authLoaded = false;
                this.http.setLoginStatus(false);
                this.initAuth();
            }
        })
    }

    get is_ready() { return this.http.hasToken; }

    /**
     * Initialises authentication details and sets up OAuth
     */
    public initAuth(tries: number = 0) {
        if (this.authLoaded) { return new Promise((rs) => rs()); }
        if (tries > 10) { tries--; }
        if (!this.model.auth_promise) {
            this.model.auth_promise = new Promise((resolve, reject) => {
                log('RESRC', `Loading Authority...`);
                if (this.mock) {
                    this.authLoaded = true;
                    return resolve();
                }
                const parts = this.url.split('/');
                const uri = parts.splice(0, 3).join('/');
                const base_el = document.getElementsByTagName('base')[0];
                let base = base_el ? (base_el.href ? base_el.href : '/') : '/';
                if (base === '.') { base = location.pathname; }
                this.get('Authority').get_authority().then((auth: any) => {
                    log(`RESRC`, `Authority loaded. Session: ${auth.session === true}`, auth);
                    if (typeof auth !== 'object') {
                        return reject({ message: 'Auth details no valid.' });
                    }
                    let url = encodeURIComponent(location.href);
                    url = auth.login_url.replace('{{url}}', url);
                    this.http.setupOAuth({
                        login_redirect: (uri && location.origin.indexOf(uri) === 0 ? `${url}` : ((uri || '') + url)),
                        logout_url: auth.logout_url,
                        authority_loaded: true
                    });
                    this.authLoaded = true;
                    if (auth.session) {
                        this.http.setLoginStatus(auth.session)
                            .then(() => this.http.tryLogin(), () => this.http.tryLogin());
                    } else {
                        this.http.tryLogin();
                    }
                    resolve(auth);
                    setTimeout(() => this.model.auth_promise = null, 300);
                }, (err: any) => {
                    error('RESRC', 'Error getting authority.', err);
                    reject(err);
                    setTimeout(() => {
                        this.model.auth_promise = null;
                        this.initAuth(tries);
                    }, 500 * ++tries);
                });
            });
        }
        return this.model.auth_promise;
    }
    /**
     * Setup OAuth
     * @param options OAuth options
     */
    public setup(options: { [name: string]: any }) {
        this.http.setupOAuth({
            login_url: options.oauth_server,
            refresh_uri: options.oauth_tokens,
            redirect_uri: options.redirect_uri,
            client_id: this.http.hash(options.redirect_uri),
            login_local: options.login_local,
            scope: options.scope
        });
        this.url = options.api_endpoint;
    }

    /**
     * Initialises all the resource factories for each route
     * @param url_base Base resource URL, defaults to origin + '/control/'
     * @return Promise of the state of auth
     */
    public init(url_base?: string, mock: boolean = false) {
        if (mock) {
            this.http.mock();
            this.mock = mock;
        }
        return new Promise<any>((resolve, reject) => {
            if (!url_base && !this.url) {
                this.url = location.origin + '/control/';
            } else {
                this.url = url_base ? url_base : this.url;
            }
            if (this.url[this.url.length - 1] !== '/') {
                this.url += '/';
            }
            let custom: any;
            // Factory for API Modules
            this.new('Module', this.url + 'api/modules/:id/:task', {
                id: '@id',
                task: '@_task',
            }, COMMON.crud);
            // Factory for System Modules
            this.new('SystemModule', this.url + 'api/systems/:sys_id/modules/:mod_id', {
                mod_id: '@module_id',
                sys_id: '@system_id',
            }, COMMON.crud);
            // Factory for API Triggers
            this.new('Trigger', this.url + 'api/triggers/:id', {
                id: '@id',
            }, COMMON.crud);
            // Factory for system triggers
            custom = JSON.parse(JSON.stringify(COMMON.crud));
            custom.query = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/system_triggers',
            };
            this.new('SystemTrigger', this.url + 'api/triggers/:id', {
                id: '@id',
            }, custom);
            // Factory for System
            custom = JSON.parse(JSON.stringify(COMMON.crud));
            custom.funcs = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/systems/:id/funcs',
            };
            custom.exec = {
                method: COMMON.cmd.POST,
                headers: COMMON.headers,
                url: this.url + 'api/systems/:id/exec',
                // isArray: true
            };
            custom.types = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/systems/:id/types',
                // isArray: true
            };
            custom.count = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/systems/:id/count',
            };
            this.new('System', this.url + 'api/systems/:id/:task', {
                id: '@id',
                task: '@_task',
            }, custom);
            // Factory for Dependencies
            this.new('Dependency', this.url + 'api/dependencies/:id/:task', {
                id: '@id',
                task: '@_task',
            }, COMMON.crud);
            // Factory for Node
            this.new('Node', this.url + 'api/nodes/:id', {
                id: '@id',
            }, COMMON.crud);
            // Factory for Group
            this.new('Group', this.url + 'api/groups/:id', {
                id: '@id',
            }, COMMON.crud);
            // Factory for Zone
            this.new('Zone', this.url + 'api/zones/:id', {
                id: '@id',
            }, COMMON.crud);
            // Factory for Discovery
            custom = JSON.parse(JSON.stringify(COMMON.crud));
            custom.scan = {
                method: COMMON.cmd.POST,
                headers: COMMON.headers,
                url: this.url + 'api/discovery/scan',
            };
            this.new('Discovery', this.url + 'api/discovery/:id', {
                id: '@id',
            }, custom);
            // Factory for Logs
            custom = JSON.parse(JSON.stringify(COMMON.crud));
            custom.missing_connections = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/logs/missing_connections',
            },
                custom.system_logs = {
                    method: COMMON.cmd.GET,
                    headers: COMMON.headers,
                    url: this.url + 'api/logs/system_logs',
                };
            this.new('Log', this.url + 'api/logs/:id', {
                id: '@id',
            }, custom);
            // Factory for User
            custom = JSON.parse(JSON.stringify(COMMON.crud));
            custom.current = {
                method: COMMON.cmd.GET,
                headers: COMMON.headers,
                url: this.url + 'api/users/current',
            };
            this.new('User', this.url + 'api/users/:id', {
                id: '@id',
            }, custom);

            // Resource for Authority
            let auth: any;
            auth = {};
            auth.get_authority = (auth_url?: string) => {
                if (!auth_url) {
                    auth_url = this.url;
                }
                if (auth_url.indexOf('http') < 0) {

                }
                return (new Promise((auth_res, auth_rej) => {
                    let authority: any;
                    const parts = auth_url.split('/');
                    const url = parts.splice(0, 3).join('/') + '/';
                    this.http_unauth.get(url + 'auth/authority')
                        .subscribe(
                        (data: any) => authority = data,
                        (err: any) => auth_rej(err),
                        () => auth_res(authority),
                    );
                }));
            };
            if (this.factories === undefined) {
                this.factories = {};
            }
            this.factories.Authority = auth;
            this.initAuth().then((resp) => resolve(resp), (err) => reject(err));
        });
    }
    /**
     * Get the user access token for the API
     * @return  OAuth access token
     */
    public getToken() {
        return this.http.token;
    }
    /**
     * Check if the the user is current authorised
     */
    public checkAuth() {
        this.http.checkAuth(() => log('RESRC', 'Refreshed Auth'));
    }
    /**
     * Create a new resource factory with the given parameters.
     * @param name    Name of the resource factory
     * @param url     Base API URL of the resources
     * @param params  Route paramters available on the API URL
     * @param methods Request methods that are avaiable on this resource
     */
    public new(name: string, url: string, params: any, methods: any) {
        const factory = new ResourceFactory(url, params, methods, this.http);
        factory.service = this;
        if (this.factories === undefined) {
            this.factories = {};
        }
        this.factories[name] = factory;
    }

    /**
     * Get a resource factory with the given name
     * @param name Name of the resource factory to get
     * @return  Returns a resource factory, null if not found
     */
    public get(name: string) {
        if (!this.authLoaded) {
            log(`RESRC`, `Not ready to perform API requests.`, null, 'warn');
        }
        return this.factories && this.factories[name] ? this.factories[name] : null;
    }
}