'use strict';

var sandraControllers = angular.module('sandraControllers', []);

sandraControllers.controller('AppController', [
    '$scope',
    '$mdSidenav',
    '$timeout',
    'Keyspace',
    function ($scope, $mdSidenav, $timeout, Keyspace) {
        $scope.toggleSidenav = function (menuId) {
            $mdSidenav(menuId).toggle();
        };

        $scope.mainPageError = false;
        $scope.checkConnection = function () {
            Keyspace.query(function () {
                $scope.mainPageError = false;
            }, function (answer) {
                $scope.mainPageError = answer.data.message;
            });
        };
        $scope.checkConnection();

        $scope.runQueryInNewTab = function (query) {
            $scope.selectedIndex = $scope.tabs.length - 1;
            $timeout(function () {
                $scope.tabs[$scope.selectedIndex].query = query;
            }, 500);
        };

        var tabId = 1;
        $scope.tabs = [{title: 'query ' + tabId, tabId: tabId}];
        $scope.$watch('selectedIndex', function (current) {
            if (current >= $scope.tabs.length - 1) {
                if (current > $scope.tabs.length - 1) {
                    $scope.selectedIndex = $scope.tabs.length - 1;
                    return;
                }

                tabId++;
                $scope.tabs.push({title: '+', tabId: tabId, query: ''});
                $scope.tabs[current].title = 'query ' + $scope.tabs[current].tabId;
                $scope.$watch('tabs.length', function () {
                    if (1 == $scope.tabs.length) {
                        $scope.selectedIndex = 1;
                    }
                });
            }
        });
    }
]);

sandraControllers.controller('TextQueryController', [
    '$scope',
    'Keyspace',
    'CQL',
    function ($scope, Keyspace, CQL) {
        $scope.codemirrorLoaded = function (_editor) {
            _editor.setOption('mode', 'text/x-cassandra');
            _editor.setOption('lineWrapping', true);
            _editor.setSize(null, 'auto');

            var element = angular.element(_editor.doc.cm.getWrapperElement());
            element.addClass('md-input');
        };

        $scope.closeThisTab = function () {
            for (var i = 0; i < $scope.$parent.tabs.length; i++) {
                if ($scope.$parent.tabs[i].tabId == $scope.tab.tabId) {
                    $scope.$parent.tabs.splice(i, 1);
                }
            }
        };
        $scope.cqlQuery = ' ';
        $scope.$watch('tab.query', function () {
            if ($scope.tab.query) {
                $scope.cqlQuery = $scope.tab.query;
                $scope.executeQuery();
            }
        });

        $scope.inProgress = false;

        $scope.loadKeyspaces = function () {
            Keyspace.query(function (keyspaces) {
                keyspaces.unshift({keyspace_name: ''});
                $scope.keyspaces = keyspaces;
            });
        };

        $scope.selectedKeyspaceName = '';
        $scope.executeQuery = function () {
            $scope.inProgress = true;
            CQL.query({'keyspace': $scope.selectedKeyspaceName, query: $scope.cqlQuery}, function (result) {
                $scope.inProgress = false;
                $scope.queryResult = result;
            }, function (answer) {
                //query error result
                $scope.inProgress = false;
                $scope.queryResult = answer.data;
            });
        };
    }
]);

sandraControllers.controller('ExplorerController', [
    '$scope',
    '$mdDialog',
    'Keyspace',
    'ColumnFamily',
    'Column',
    'Utilities',
    function ($scope, $mdDialog, Keyspace, ColumnFamily, Column, Utilities) {
        var init = function () {
            $scope.keyspaces = Keyspace.query();
            $scope.currentItem = null;
        };
        init();

        $scope.refresh = function () {
            init();
        };

        $scope.setCurrentItem = function (item) {
            $scope.currentItem = item;
        };

        $scope.getColumnFamilies = function (keyspace) {
            if (!keyspace.isActive) {
                keyspace.columnFamilies = ColumnFamily.query({keyspace: keyspace.keyspace_name});
                keyspace.isActive = true;
            }
            else {
                keyspace.isActive = false;
            }
        };

        $scope.getColumns = function (keyspace, columnFamily) {
            if (!columnFamily.isActive) {
                columnFamily.columns = Column.query({
                    keyspace: keyspace.keyspace_name,
                    columnFamily: columnFamily.columnfamily_name
                });
                columnFamily.isActive = true;
            }
            else {
                columnFamily.isActive = false;
            }
        };

        $scope.selectColumn = function (column) {
            $scope.currentItem = column;
        };

        $scope.dropKeyspace = function (keyspace) {
            var confirm = $mdDialog.confirm()
                .title('Drop the Keyspace')
                .content('Are you sure you want to drop "' + keyspace.keyspace_name + '"?')
                .ariaLabel('Drop')
                .ok('Yes, drop it')
                .cancel('Cancel');

            $mdDialog.show(confirm).then((function (k) {
                return function () {
                    var keyspace = new Keyspace({'keyspace_name': k.keyspace_name});
                    keyspace.$delete(function () {
                        init();
                    }, function (answer) {
                        $mdDialog.show(
                            $mdDialog.alert()
                                .title(answer.data.error)
                                .content(answer.data.message)
                                .ariaLabel(answer.data.error)
                                .ok('Ok')
                        );
                    });
                }
            })(keyspace));

        };

        $scope.addUpdateKeyspace = function (initialKeyspace) {
            $mdDialog.show({
                controller: AddUpdateKeyspaceController,
                templateUrl: 'partials/dialogforms/keyspace.html',
                locals: {initialKeyspace: initialKeyspace}
            }).then(function () {
                init();
            });

            function AddUpdateKeyspaceController($scope, $mdDialog, initialKeyspace) {
                $scope.strategyClassOptions = Utilities.strategyClassOptions;
                if (initialKeyspace) {
                    $scope.operationType = 'Update';
                    initialKeyspace.replication = {};
                    initialKeyspace.replication.replication_factor = parseInt(JSON.parse(initialKeyspace.strategy_options).replication_factor);
                    initialKeyspace.replication.class = 'SimpleStrategy';
                }
                else {
                    $scope.operationType = 'Create';
                    initialKeyspace = {
                        keyspace_name: '',
                        replication: {
                            class: 'SimpleStrategy',
                            replication_factor: ''
                        }
                    };
                }
                $scope.keyspace = initialKeyspace;

                $scope.cancel = function () {
                    $mdDialog.cancel();
                };
                $scope.answer = function () {
                    if (!$scope.keyspace.keyspace_name) {
                        $scope.errorMessage = 'please fill the name field';
                        return;
                    }
                    var keyspace = new Keyspace($scope.keyspace);
                    if ($scope.operationType == 'Update') {
                        keyspace.$update({}, function (a) {
                            $mdDialog.hide(a);
                        }, function (answer) {
                            $scope.errorMessage = answer.data.message;
                        });
                    } else {
                        keyspace.$save({}, function (a) {
                            $mdDialog.hide(a);
                        }, function (answer) {
                            $scope.errorMessage = answer.data.message;
                        });
                    }
                };
            }

            AddUpdateKeyspaceController.$inject = ['$scope', '$mdDialog', 'initialKeyspace'];
        };
        $scope.showRows = function (columnFamily) {
            var query = 'select * from ' + columnFamily.keyspace_name + '.' + columnFamily.columnfamily_name;
            $scope.$parent.runQueryInNewTab(query);
        };
        $scope.dropColumnFamily = function (columnFamily) {
            var confirm = $mdDialog.confirm()
                .title('Drop the Column Family')
                .content('Are you sure you want to drop "' + columnFamily.columnfamily_name + '"?')
                .ariaLabel('Drop')
                .ok('Yes, drop it')
                .cancel('Cancel');

            $mdDialog.show(confirm).then((function (c) {
                return function () {
                    var columnFamily = new ColumnFamily({
                        'keyspace_name': c.keyspace_name,
                        'columnfamily_name': c.columnfamily_name
                    });
                    columnFamily.$delete(function () {
                        init();
                    }, function (answer) {
                        $mdDialog.show(
                            $mdDialog.alert()
                                .title(answer.data.error)
                                .content(answer.data.message)
                                .ariaLabel(answer.data.error)
                                .ok('Ok')
                        );
                    });
                }
            })(columnFamily));

        };


        $scope.dropColumn = function (column) {
            var confirm = $mdDialog.confirm()
                .title('Drop the Column')
                .content('Are you sure you want to drop "' + column.column_name + '"?')
                .ariaLabel('Drop')
                .ok('Yes, drop it')
                .cancel('Cancel');

            $mdDialog.show(confirm).then((function (c) {
                return function () {
                    var column = new Column({
                        'keyspace_name': c.keyspace_name,
                        'columnfamily_name': c.columnfamily_name,
                        'column_name': c.column_name
                    });
                    column.$delete(function () {
                        init();
                    }, function (answer) {
                        $mdDialog.show(
                            $mdDialog.alert()
                                .title(answer.data.error)
                                .content(answer.data.message)
                                .ariaLabel(answer.data.error)
                                .ok('Ok')
                        );
                    });
                }
            })(column));

        };

        $scope.addUpdateColumn = function (initialColumnFamily, initialColumn) {
            $mdDialog.show({
                controller: AddUpdateColumnnController,
                templateUrl: 'partials/dialogforms/column.html',
                locals: {initialColumnFamily: initialColumnFamily, initialColumn: initialColumn}
            }).then(function () {
                init();
            });

            function AddUpdateColumnnController($scope, $mdDialog, initialColumnFamily, initialColumn) {
                $scope.typeOptions = Utilities.cqlDataTypes;

                if (initialColumn) {
                    $scope.operationType = 'Update';
                }
                else {
                    $scope.operationType = 'Create';
                    initialColumn = {
                        column_name: '',
                        columnfamily_name: initialColumnFamily.columnfamily_name,
                        keyspace_name: initialColumnFamily.keyspace_name
                    };
                }
                $scope.column = initialColumn;

                $scope.cancel = function () {
                    $mdDialog.cancel();
                };
                $scope.answer = function () {
                    if (!$scope.column.column_name || !$scope.column.type) {
                        $scope.errorMessage = 'please fill the name field';
                        return;
                    }
                    var column = new Column($scope.column);
                    if ($scope.operationType == 'Update') {
                        column.$update({}, function (a) {
                            $mdDialog.hide(a);
                        }, function (answer) {
                            $scope.errorMessage = answer.data.message;
                        });
                    } else {
                        column.$save({}, function (a) {
                            $mdDialog.hide(a);
                        }, function (answer) {
                            $scope.errorMessage = answer.data.message;
                        });
                    }

                };
            }

            AddUpdateColumnnController.$inject = ['$scope', '$mdDialog', 'initialColumnFamily', 'initialColumn'];
        };

    }
]);