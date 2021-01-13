import { Driver } from "neo4j-driver";
import { graphql, GraphQLScalarType } from "graphql";
import { Kind } from "graphql/language";
import { generate } from "randomstring";
import { describe, beforeAll, afterAll, test, expect } from "@jest/globals";
import neo4j from "./neo4j";
import makeAugmentedSchema from "../../src/schema/make-augmented-schema";

const GraphQLUpperCaseString = new GraphQLScalarType({
    name: "UpperCaseString",
    description: "The `UpperCaseString` scalar type returns all strings in lower case",
    serialize: (value: string) => {
        return value.toUpperCase();
    },
    parseValue: (value: string) => {
        return value.toUpperCase();
    },
    parseLiteral: (ast) => {
        if (ast.kind === Kind.STRING) {
            return ast.value.toUpperCase();
        }

        return undefined;
    },
});

describe("scalars", () => {
    let driver: Driver;

    beforeAll(async () => {
        driver = await neo4j();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should create a movie (with a custom scalar)", async () => {
        const session = driver.session();

        const typeDefs = `
            scalar UpperCaseString
          
            type Movie {
              id: ID
              name: UpperCaseString
            }
        `;

        const neoSchema = makeAugmentedSchema({
            typeDefs,
            resolvers: { UpperCaseString: GraphQLUpperCaseString },
        });

        const id = generate({
            charset: "alphabetic",
        });

        const initialName = "dan";
        const expectedName = "DAN";

        const create = `
            mutation {
                createMovies(input:[{id: "${id}", name: "${initialName}"}]) {
                    movies {
                        id
                    }
                }
            }
        `;

        try {
            const gqlResult = await graphql({
                schema: neoSchema.schema,
                source: create,
                contextValue: { driver },
            });

            expect(gqlResult.errors).toBeFalsy();

            const result = await session.run(`
                MATCH (m:Movie {id: "${id}"})
                RETURN m {.id, .name} as m
            `);

            expect((result.records[0].toObject() as any).m).toEqual({ id, name: expectedName });
        } finally {
            await session.close();
        }
    });
});
