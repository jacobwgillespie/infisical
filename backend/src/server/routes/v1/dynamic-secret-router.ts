import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { DYNAMIC_SECRETS } from "@app/lib/api-docs";
import { daysToMillisecond } from "@app/lib/dates";
import { removeTrailingSlash } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { DynamicSecretProviderSchema } from "@app/services/dynamic-secret/providers/models";

import { SanitizedDynamicSecretSchema } from "../sanitizedSchemas";

export const registerDynamicSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.CREATE.projectSlug),
        provider: DynamicSecretProviderSchema.describe(DYNAMIC_SECRETS.CREATE.provider),
        defaultTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.defaultTTL)
          .superRefine((val, ctx) => {
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          }),
        maxTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.maxTTL)
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          })
          .nullable(),
        path: z.string().describe(DYNAMIC_SECRETS.CREATE.path).trim().default("/").transform(removeTrailingSlash),
        environmentSlug: z.string().describe(DYNAMIC_SECRETS.CREATE.environmentSlug).min(1),
        name: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.name)
          .min(1)
          .toLowerCase()
          .max(64)
          .refine((v) => slugify(v) === v, {
            message: "Slug must be a valid"
          })
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:name",
    method: "PATCH",
    schema: {
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.UPDATE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.UPDATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.environmentSlug),
        data: z.object({
          inputs: z.any().optional().describe(DYNAMIC_SECRETS.UPDATE.inputs),
          defaultTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.defaultTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > daysToMillisecond(1))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
            }),
          maxTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.maxTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > daysToMillisecond(1))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
            })
            .nullable(),
          newName: z.string().describe(DYNAMIC_SECRETS.UPDATE.newName).optional()
        })
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.updateByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        path: req.body.path,
        projectSlug: req.body.projectSlug,
        environmentSlug: req.body.environmentSlug,
        ...req.body.data
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:name",
    method: "DELETE",
    schema: {
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.DELETE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.DELETE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.environmentSlug),
        isForced: z.boolean().default(false).describe(DYNAMIC_SECRETS.DELETE.isForced)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.deleteByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.body
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:name",
    method: "GET",
    schema: {
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.GET_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.getDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.query
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.LIST.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecrets: SanitizedDynamicSecretSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfgs = await server.services.dynamicSecret.list({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      return { dynamicSecrets: dynamicSecretCfgs };
    }
  });

  server.route({
    url: "/:name/leases",
    method: "GET",
    schema: {
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEAES_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEAES_BY_NAME.projectSlug),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRETS.LIST_LEAES_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEAES_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          leases: DynamicSecretLeasesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const leases = await server.services.dynamicSecretLease.listLeases({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.query
      });
      return { leases };
    }
  });
};
