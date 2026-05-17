.PHONY: help test-unit test-integration test-e2e test-lint test-types test-fast test-all test-full test-coverage

help:
	@./scripts/run_tests.sh help

test-unit:
	@./scripts/run_tests.sh unit

test-integration:
	@./scripts/run_tests.sh integration

test-e2e:
	@./scripts/run_tests.sh e2e

test-lint:
	@./scripts/run_tests.sh lint

test-types:
	@./scripts/run_tests.sh types

test-fast:
	@./scripts/run_tests.sh fast

test-all:
	@./scripts/run_tests.sh all

test-full:
	@./scripts/run_tests.sh full

test-coverage:
	@./scripts/run_tests.sh coverage
