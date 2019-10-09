/**
 * @Author: Alex Sorafumo
 * @Date:   19/10/2016 10:47 AM
 * @Email:  alex@yuion.net
 * @Filename: oauth2.service.ts
 * @Last modified by:   Alex Sorafumo
 * @Last modified time: 06/02/2017 11:21 AM
 */

import { Location } from '@angular/common';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { log, error } from '../../settings';
import { DataStoreService, IDataStore } from '../data-store.service';

@Injectable({
    providedIn: 'root'
})
export class OAuthService {
    public model: { [name: string]: any } = {}
    public validationHandler: any;

    private debug: boolean = false;
    private _storage: string = 'local';
    private needs_login: boolean = false;

    private promises: { [name: string]: Promise<any> } = {};
    private subjects: { [name: string]: BehaviorSubject<any> } = {};
    private observers: { [name: string]: Observable<any> } = {};
    private timers: { [name: string]: any } = {};

    constructor(private location: Location, private store: DataStoreService) {
        if (!this.subjects.login) {
            this.subjects.login = new BehaviorSubject(this.needs_login);
            this.observers.login = this.subjects.login.asObservable();
        }
    }

    /**
     * Set the type of storage to use for OAuth
     * @param storage Storage to use Local or Session
     */
    public setStorage(storage: string) {
        this._storage = storage;
    }

    get storage(): IDataStore {
        return this.store[this._storage];
    }

    /**
     * Get generated login URL with the set parameters
     * @return  Generated login URL
     */
    get login_url() {
        return this.createLoginUrl('').then((url) => url);
    }

    /**
     * Get generated refresh URL with the set parameters
     * @return Generated refresh URL
     */
    get refresh_url() {
        return this.createRefreshUrl('').then((url) => url);
    }

    /**
     * Get value of parameter on the service
     * @param name
     */
    public get(name: string) {
        return typeof this.model[name] === 'object' ? JSON.parse(JSON.stringify(this.model[name])) : this.model[name];
    }

    /**
     * Get value of parameter on the service
     * @param name
     */
    public set(name: string, value: any) {
        this.model[name] = value;
    }

    /**
     * Listen to auth state of the user
     * @param next Callback for auth state of user
     */
    public needsLogin(next: (state: boolean) => void) {
        if (!this.subjects.login) {
            this.subjects.login = new BehaviorSubject(this.needs_login);
            this.observers.login = this.subjects.login.asObservable();
        }
        return this.observers.login.subscribe(next);
    }

    /**
     * Try to process login
     * @param options Login processing options
     * @return Promise of login success
     */
    public tryLogin(options?: { [name: string]: any }) {
        return this.attemptLogin(options);
    }

    public tryLoginWithIFrame() {
        throw new Error('tryLoginWithIFrame has not been implemented so far');
    }

    public tryRefresh(timeoutInMsec: number) {
        throw new Error('tryRefresh has not been implemented so far');
    }

    /**
     * Get the identity claims from storage
     * @return Identity claims
     */
    public async getIdentityClaims() {
        const claims = await this.storage.getItem(`${this.model.client_id}_id_token_claims_obj`);
        if (!claims) { return null; }
        return JSON.parse(claims);
    }

    /**
     * Get the ID Token from storage
     * @return  ID Token
     */
    public getIdToken() {
        return this.storage.getItem(`${this.model.client_id}_id_token`).then((res: string) => res);
    }

    /**
     * Get the Access Token from storage
     * @return Access Token
     */
    public getAccessToken() {
        if (!this.promises.access_token) {
            this.promises.access_token = new Promise((resolve) => {
                this.storage.getItem(`${this.model.client_id}_access_token`).then((token: string) => {
                    if (!token) {
                        this.storage.getItem(`access_token`).then((token_local: string) => {
                            resolve(token_local);
                            this.promises.access_token = null;
                        }, () => this.promises.access_token = null);
                    } else {
                        resolve(token);
                        this.promises.access_token = null;
                    }
                }, () => this.promises.access_token = null);
            });
        }
        return this.promises.access_token;
    }
    /**
     * Get the Refresh Token from storage
     * @return  Refresh Token
     */
    public getRefreshToken() {
        if (!this.promises.refresh_token) {
            this.promises.refresh_token = new Promise((resolve) => {
                this.storage.getItem(`${this.model.client_id}_refresh_token`).then((token: string) => {
                    if (!token) {
                        this.storage.getItem(`refresh_token`).then((token_local: string) => {
                            resolve(token_local);
                            this.promises.refresh_token = null;
                        });
                    } else {
                        resolve(token);
                        this.promises.refresh_token = null;
                    }
                });
            });
        }
        return this.promises.refresh_token;
    }

    /**
     * Check if Access Token is still valid
     * @return Expiry state of the access token
     */
    public hasValidAccessToken() {
        if (!this.promises.valid_access_token) {
            this.promises.valid_access_token = new Promise<boolean>((resolve) => {
                this.getAccessToken().then(() => {
                    this.storage.getItem(`${this.model.client_id}_expires_at`).then((expiresAt: string) => {
                        setTimeout(() => this.promises.valid_access_token = null, 10);
                        if (!expiresAt) {
                            this.storage.getItem(`accessExpiry`).then((expiresAt_local: string) => {
                                const now = new Date();
                                if (!expiresAt || parseInt(expiresAt_local, 10) < now.getTime()) {
                                    return resolve(false);
                                }
                                return resolve(true);
                            });
                        } else {
                            const now = new Date();
                            if (expiresAt && parseInt(expiresAt, 10) < now.getTime()) {
                                return resolve(false);
                            }
                            return resolve(true);
                        }
                    });
                });
            });
        }
        return this.promises.valid_access_token;
    }


    /**
     * Check if ID Token is still valid
     * @return Expiry state of the ID Token
     */
    public hasValidIdToken() {
        if (!this.promises.id_token) {
            this.promises.id_token = new Promise<boolean>((resolve) => {
                if (this.getIdToken) {
                    this.storage.getItem(`${this.model.client_id}_id_token_expires_at`)
                        .then((expiresAt: string) => {
                            const now = new Date();
                            if (expiresAt && parseInt(expiresAt, 10) < now.getTime()) {
                                return resolve(false);
                            } else {
                                return resolve(true);
                            }
                        });
                } else {
                    resolve(false);
                }
            });
        }
    }

    /**
     * Get the authorisation header to add to requests
     * @return Authorisation header
     */
    public authorizationHeader() {
        if (!this.promises.auth_header) {
            this.promises.auth_header = new Promise<string>((resolve) => {
                this.getAccessToken().then((token: string) => {
                    resolve(`Bearer ${token}`);
                    if (token) {
                        setTimeout(() => this.promises.auth_header = null, 300);
                    } else {
                        this.promises.auth_header = null;
                    }
                });
            });
        }
        return this.promises.auth_header;
    }

    /**
     * Clears storage and redirects to logout URL
     */
    public logout() {
        log('OAUTH', 'Logging out. Clear access tokens...');
        const id_token = this.getIdToken();
        this.clearAuth();
        if (!this.model.logout_url) {
            return setTimeout(() => this.location.replaceState(this.location.path(), ''), 100);
        }
        const logout_url = this.model.logout_url.replace(/\{\{id_token\}\}/, id_token);
        log('OAUTH', 'Redirecting to logout URL...');
        location.href = logout_url;
    }

    /**
     * Removes any auth related details from storage
     */
    public clearAuth() {
        if (!this.promises.clear_auth) {
            this.promises.clear_auth = new Promise((resolve) => {
                log('OAUTH', `Clearing authentication variables...`);
                const items = [
                    'access_token', 'refresh_token', 'accesstoken', 'refreshtoken',
                    'id_token', 'idtoken', 'nonce', 'expires', 'expiry', 'login', 'oauth',
                ];
                const test_map: any = {};
                this.storage.keys().then((keys) => {
                    for (const key of keys) {
                        const lkey = key.toLowerCase();
                        for (const i of items) {
                            if (lkey.indexOf(i) >= 0) {
                                test_map[key] = false;
                                this.storage.removeItem(key).then(() => {
                                    log('OAUTH', `Remove key '${key}' from ${this._storage} storage`);
                                    test_map[key] = true;
                                    for (const k in test_map) {
                                        if (test_map.hasOwnProperty(k) && !test_map[k]) { return; }
                                    }
                                });
                                break;
                            }
                        }
                    }
                });
                setTimeout(() => {
                    resolve();
                    this.promises.clear_auth = null;
                }, 300);
            });
        }
        return this.promises.clear_auth;
    }

    /**
     * Reload the page if authentication is local
     */
    public reload() {
        if (!this.model.login_local) {
            error('OAUTH', `Reloading page...`);
            location.reload();
        }
    }

    /**
     * Clear authentication cache and reload the page
     */
    public reset() {
        this.stopReset();
        this.timers.reset = setTimeout(() => {
            this.clearAuth();
            this.reload();
            this.timers.reset = null;
        }, 200);
    }

    /**
     * Stop resetting authentication process
     */
    public stopReset() {
        if (this.timers.clear) {
            clearTimeout(this.timers.reset);
            this.timers.reset = null;
        }
    }

    /**
     * Start process to login and getting OAuth tokens
     * @param additionalState OAuth State
     */
    public initImplicitFlow(additionalState: string = '') {
        if (!this.model.client_id || this.model.client_id === '' || this.model.run_flow) {
            return;
        }
        this.model.run_flow = true;
        log('OAUTH', 'Client ID:', this.model.client_id);
        this.createLoginUrl(additionalState).then((url) => {
            let path = location.href;
            if (location.hash.indexOf(path) >= 0 && location.href.indexOf(location.origin + '/#/') >= 0) {
                if (path.indexOf('?') >= 0) {
                    path = path.split('?')[0];
                }
            }
            const here = path;
            this.store.local.setItem(`oauth_redirect`, here);
            this.store.session.getItem(`${this.model.client_id}_login`).then((logged: string) => {
                if ((logged === 'true' || this.model.has_session) && url.indexOf('http') >= 0) {
                    log('OAUTH', 'Logged in. Authorizing...');
                    this.store.session.removeItem(`${this.model.client_id}_login`);
                    location.href = url;
                    setTimeout(() => this.model.run_flow = false, 1000);
                } else {
                    log('OAUTH', 'Not logged in redirecting to provider...');
                    if (this.model.login_local) {
                        this.subjects.login.next(true);
                        setTimeout(() => this.model.run_flow = false, 1000);
                    } else {
                        if (!this.model.login_redirect && location.origin.indexOf('http') >= 0) {
                            this.model.login_redirect = `/login?continue=${location.href}`;
                        }
                        if (this.model.authority_loaded) {
                            // this.store.session.setItem(`${this.model.client_id}_login`, 'true');
                            log('OAUTH', `Login: ${this.model.login_redirect}`);
                            this.hasValidAccessToken().then((state) => {
                                if (!state) {
                                    if (location.hash.indexOf('access_token') < 0 && location.search.indexOf('access_token') < 0) {
                                        location.href = this.model.login_redirect;
                                    }
                                }
                            });
                        } else {
                            log('OAUTH', `Authority hasn't loaded yet.`);
                            setTimeout(() => this.model.run_flow = false, 1000);
                        }
                    }
                }
            });
        }, () => this.model.run_flow = false);
    }

    /**
     * Generate a login URL with the set parameters
     * @param state OAuth State
     * @return Generated login URL
     */
    private createLoginUrl(state?: string): Promise<string> {
        if (!state) { state = ''; }
        return this.createAndSaveNonce().then((nonce: any) => {
            if (state) { state = nonce + ';' + state; }
            else { state = nonce; }
            let response_type = this.model.response_type ? this.model.response_type : 'token';
            if (this.model.oidc) {
                response_type = 'id_token+' + response_type;
            }
            const query = this.model.login_url.indexOf('?') < 0
            let url = this.model.login_url + (query ? '?' : '&')
                + `response_type=${encodeURIComponent(response_type)}`
                + `&client_id=${encodeURIComponent(this.model.client_id)}`
                + `&state=${encodeURIComponent(state)}`
                + `&redirect_uri=${encodeURIComponent(this.model.redirect_uri)}`
                + `&scope=${encodeURIComponent(this.model.scope)}`;

            if (this.model.oidc) {
                url += `&nonce=${encodeURIComponent(nonce)}`;
            }

            return url;
        });
    }

    /**
     * Generate a refresh URL with the set parameters
     * @param state OAuth State
     * @return Generated refresh URL
     */
    private createRefreshUrl(state: string): Promise<string> {
        if (typeof state === 'undefined') { state = ''; }

        return this.createAndSaveNonce().then((nonce: string) => {
            let url = this.model.refresh_uri
                + '?client_id='
                + encodeURIComponent(this.model.client_id)
                + '&redirect_uri='
                + encodeURIComponent(this.model.redirect_uri);
            return this.storage.getItem(`${this.model.client_id}_refresh_token`)
                .then((refresh_token: string) => {
                    if (!refresh_token) {
                        return this.storage.getItem(`refresh_token`).then((refresh_token_local: string) => {
                            if (refresh_token_local) {
                                url += `&refresh_token=${encodeURIComponent(refresh_token_local)}`;
                                url += `&grant_type=${encodeURIComponent('refresh_token')}`;
                                return url;
                            } else {
                                url += `&code=${encodeURIComponent(this.model.code)}&`;
                                url += `grant_type=${encodeURIComponent('authorization_code')}`;
                                return url;
                            }
                        });
                    } else {
                        url += `&refresh_token=${encodeURIComponent(refresh_token)}`;
                        url += `&grant_type=${encodeURIComponent('refresh_token')}`;
                        return url;
                    }
                });
        });
    }


    private callEventIfExists(options: any) {
        if (options.onTokenReceived) {
            const tokenParams = {
                idClaims: this.getIdentityClaims(),
                idToken: this.getIdToken(),
                access_token: this.getAccessToken(),
                state: this.model.state,
            };
            options.onTokenReceived(tokenParams);
        }
    }

    /**
     * Attempts to process login information
     * @param options Login processing options
     */
    private attemptLogin(options: { [name: string]: any }, tries: number = 0) {
        if (!this.promises.login) {
            this.promises.login = new Promise((resolve) => {
                if (tries > 10) {
                    this.promises.login = null;
                    return resolve();
                }
                if (this.model.client_id && this.model.client_id !== '') {
                    options = options || {};

                    let parts = this.getFragment();
                    if (Object.keys(parts).length <= 1) {
                        this.store.session.getItem('OAUTH.params').then((item: string) => {
                            if (item) { parts = JSON.parse(item); }
                            this.store.session.removeItem('OAUTH.params');
                            this.processLogin(parts, options).then(
                                (i) => { resolve(i); this.promises.login = null; }
                            );
                        });
                    } else {
                        this.processLogin(parts, options).then(
                            (i) => { resolve(i); this.promises.login = null; }
                        );
                    }
                } else {
                    setTimeout(() => {
                        this.promises.login = null;
                        this.attemptLogin(options, ++tries).then((i) => resolve(i));
                    }, 200);
                }
            });
        }
        return this.promises.login;
    }

    private processLogin(parts: { [name: string]: any }, options: { [name: string]: any }) {
        return new Promise((resolve) => {
            const access_token = parts.access_token;
            const idToken = parts.id_token;
            const state = parts.state;
            const code = parts.code;
            const refresh_token = parts.refresh_token;
            log('OAUTH', `State:  ${state}`);
            log('OAUTH', `Access: ${access_token}`);

            let oauthSuccess = false;

            if ((!access_token && !code && !refresh_token) || !state) { return resolve(false); }
            if (this.model.oidc && !idToken) { return resolve(false); }

            if (code) { this.model.code = code; }
            if (refresh_token) {
                log('OAUTH', `Refresh: ${refresh_token}`);
                this.storage.setItem(`${this.model.client_id}_refresh_token`, refresh_token);
            }

            this.storage.getItem(`${this.model.client_id}_nonce`).then((savedNonce: string) => {
                const stateParts = state.split(';');
                const nonceInState = stateParts[0];
                if (savedNonce === nonceInState) {
                    if (access_token) {
                        this.storage.setItem(`${this.model.client_id}_access_token`, access_token);
                    }

                    const expiresIn = parts.expires_in;

                    if (expiresIn) {
                        const expiresInMilliSeconds = parseInt(expiresIn, 10) * 1000;
                        const now = new Date();
                        const expiresAt = now.getTime() + expiresInMilliSeconds;
                        this.storage.setItem(`${this.model.client_id}_expires_at`, '' + expiresAt);
                    }
                    if (stateParts.length > 1) { this.model.state = stateParts[1]; }
                    oauthSuccess = true;
                }

                if (!oauthSuccess) { return resolve(false); }
                if (!this.model.oidc && options.onTokenReceived) {
                    options.onTokenReceived({ access_token });
                }

                if (this.model.oidc) {
                    this.processIdToken(idToken, access_token).then((success) => {
                        if (!success) {
                            return resolve(false);
                        }
                    });
                }

                if (options.validationHandler) {
                    const validationParams = { access_token, idToken };
                    options.validationHandler(validationParams)
                        .then(() => this.callEventIfExists(options))
                        .catch((reason: any) => {
                            error('OAUTH', 'Error validating tokens', reason);
                        });
                } else {
                    this.callEventIfExists(options);
                }
                // NEXT VERSION: Notify parent-window (iframe-refresh)
                /*
                let win = window;
                if (win.parent && win.parent.onOAuthCallback) {
                    win.parent.onOAuthCallback(this.model.state);
                }
                */

                // Clean up after token has been received
                this.storage.removeItem('oauth_redirect');
                this.storage.setItem('oauth_finished', 'true');
                this.location.replaceState(this.location.path());
                return resolve(true);
            });
        });
    }

    /**
     * Process tokens
     * @param idToken      ID Token
     * @param access_token Access Token
     * @return  Promise of success of processing tokens
     */
    private processIdToken(idToken: string, access_token: string): Promise<boolean> {
        return new Promise((resolve) => {
            const tokenParts = idToken.split('.');
            const claimsBase64 = this.padBase64(tokenParts[1]);
            const claimsJson = ''; // Base64.decode(claimsBase64);
            const claims = JSON.parse(claimsJson);
            this.storage.getItem(`${this.model.client_id}_nonce`).then((savedNonce: string) => {

                if (claims.aud !== this.model.client_id) {
                    log('OAUTH', 'Wrong audience: ' + claims.aud, null, 'warn');
                    return resolve(false);
                }

                if (this.model.issuer && claims.iss !== this.model.issuer) {
                    log('OAUTH', 'Wrong model.issuer: ' + claims.iss, null, 'warn');
                    return resolve(false);
                }

                if (claims.nonce !== savedNonce) {
                    log('OAUTH', 'Wrong nonce: ' + claims.nonce, null, 'warn');
                    return resolve(false);
                }

                if (access_token && !this.checkAtHash(access_token, claims)) {
                    log('OAUTH', 'Wrong at_hash', null, 'warn');
                    return resolve(false);
                }

                // Das Prüfen des Zertifikates wird der Serverseite überlassen!

                const now = Date.now();
                const issuedAtMSec = claims.iat * 1000;
                const expiresAtMSec = claims.exp * 1000;

                const tenMinutesInMsec = 1000 * 60 * 10;

                if (issuedAtMSec - tenMinutesInMsec >= now || expiresAtMSec + tenMinutesInMsec <= now) {
                    log('OAUTH', 'Token has been expired', {
                        now,
                        issuedAtMSec,
                        expiresAtMSec,
                    });
                    return resolve(false);
                }

                this.storage.setItem(`${this.model.client_id}_id_token`, idToken);
                this.storage.setItem(`${this.model.client_id}_id_token_claims_obj`, claimsJson);
                this.storage.setItem(`${this.model.client_id}_id_token_expires_at`, '' + expiresAtMSec);

                if (this.validationHandler) {
                    this.validationHandler(idToken);
                }
                return resolve(true);
            });
        });
    }

    private padBase64(base64data: string) {
        while (base64data.length % 4 !== 0) {
            base64data += '=';
        }
        return base64data;
    }

    /**
     * Create a nonce and store it in storage
     * @return Nonce
     */
    private createAndSaveNonce() {
        return this.createNonce().then((nonce: any) => {
            this.storage.setItem(`${this.model.client_id}_nonce`, nonce);
            return nonce;
        });

    }

    /**
     * Generates a nonce
     * @return Promise of a nonce
     */
    private createNonce() {
        return new Promise<string>((resolve) => {
            if (this.model.rng_url) {
                throw new Error('createNonce with rng-web-api has not been implemented so far');
            } else {
                let text = '';
                const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

                for (let i = 0; i < 40; i++) {
                    text += possible.charAt(Math.floor(Math.random() * possible.length));
                }
                resolve(text);
            }

        });
    }
    /**
     * Break up URL hash/query into a key, value map
     * @return Map of key, value pairs from the URL hash/query
     */
    private getFragment(): { [name: string]: any } {
        const hash = location.hash;
        let hash_content = hash ? hash.substr(1) : '';
        const search = location.search;
            // Check if hash has key value pairs

        if (hash_content.indexOf('?') < 0 && hash_content.indexOf('=') > 0) { // Handle hash without a sub query
            if (hash_content.indexOf('#') > 0) {
                hash_content = hash_content.substr(hash_content.indexOf('#') + 1);
            }
            return this.parseQueryString(hash_content);
        } else if (hash_content.indexOf('?') >= 0 && hash_content.indexOf('=') > 0) { // Handle hash with a sub query
            let s = hash_content.substr(hash_content.indexOf('?'));
            if (s.indexOf('=') >= 0) {
                return this.parseQueryString(s.substr(1));
            }
        } else if (search.indexOf('?') >= 0 && search.indexOf('=') > 0) { // Handle query
            return this.parseQueryString(search.substr(1));
        }
        return {};
    }

    /**
     * Parse query string and generate a map of the parameters
     * @param queryString Query or hash string
     * @return  Map of key, value pairs from the query string
     */
    private parseQueryString(queryString: string) {
        const data: any = {};
        let pairs: any;
        let pair: any;
        let separatorIndex: any;
        let escapedKey: any;
        let escapedValue: any;
        let key: any;
        let value: any;

        if (queryString === null) {
            return data;
        }

        pairs = queryString.split('&');

        for (let i = 0; i < pairs.length; i++) {
            pair = pairs[i];
            separatorIndex = pair.indexOf('=');

            if (separatorIndex === -1) {
                escapedKey = pair;
                escapedValue = null;
            } else {
                escapedKey = pair.substr(0, separatorIndex);
                escapedValue = pair.substr(separatorIndex + 1);
            }

            key = decodeURIComponent(escapedKey);
            value = decodeURIComponent(escapedValue);

            if (key.substr(0, 1) === '/') {
                key = key.substr(1);
            }
            data[key] = value;
        }
        return data;
    }

    /**
     * Check if claims and tokens correctly in hash
     * @param access_token Access Token
     * @param idClaims     ID Claims
     * @return Claims and tokens correctly in hash
     */
    private checkAtHash(access_token: string, idClaims: { [name: string]: any, at_hash: string }) {
        if (!access_token || !idClaims || !idClaims.at_hash) {
            return true;
        }
        const tokenHash: any[] = []; // toByteArrayFunc(sha256.hash(access_token));
        const leftMostHalf = tokenHash.slice(0, (tokenHash.length / 2));
        const tokenHashBase64 = ''; // fromByteArrayFunc(leftMostHalf);
        const atHash = tokenHashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        const claimsAtHash = idClaims.at_hash.replace(/=/g, '');

        if (atHash !== claimsAtHash) {
            log('OAUTH', 'Exptected at_hash: ' + atHash, null, 'warn');
            log('OAUTH', 'Actual at_hash: ' + claimsAtHash, null, 'warn');
        }

        return (atHash === claimsAtHash);
    }

}