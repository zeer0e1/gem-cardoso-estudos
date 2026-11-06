import test from 'node:test';
import assert from 'node:assert/strict';
import {isAdmin,instructorError} from '../admin.js';
test('menu administrativo exige papel explícito e perfil ativo',()=>{assert.equal(isAdmin(null),false);assert.equal(isAdmin({enabled:true}),false);assert.equal(isAdmin({enabled:false,is_admin:true}),false);assert.equal(isAdmin({enabled:true,is_admin:true}),true);assert.equal(isAdmin({enabled:true,is_admin:'true'}),false)});
test('erros de acesso, conflito e autoproteção explicam a ação necessária',()=>{assert.match(instructorError(Error('ADMIN_REQUIRED')),/Somente administradores/);assert.match(instructorError(Error('VERSION_CONFLICT')),/Atualize a lista/);assert.match(instructorError(Error('CANNOT_REMOVE_OWN_ADMIN')),/próprio acesso/);assert.match(instructorError(Error('ACCOUNT_NOT_FOUND')),/ainda não tem uma conta/)});
