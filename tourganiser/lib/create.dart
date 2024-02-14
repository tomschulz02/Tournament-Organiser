import 'package:flutter/material.dart';

class CreateTournamentPage extends StatelessWidget {
  const CreateTournamentPage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create a Tournament'),
      ),
      body: CreateTournamentForm(),
    );
  }
}

class CreateTournamentForm extends StatefulWidget {
  const CreateTournamentForm({
    super.key,
  });

  @override
  State<CreateTournamentForm> createState() => _CreateTournamentFormState();
}

class _CreateTournamentFormState extends State<CreateTournamentForm> {
  
  final _createFormKey = GlobalKey<FormState>();
  
  @override
  Widget build(BuildContext context) {
    return Form(
      key: _createFormKey,
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.all(20),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Expanded(
                  child: TextFormField(
                    decoration: InputDecoration(
                      border: OutlineInputBorder(),
                      label: Text('Name of competition'),
                    ),
                    validator: (value) {
                      if (value==null || value.isEmpty) {
                        return "This field cannot be empty";
                      }
                      return null;
                    },
                  ),
                ),
                SizedBox(width: 20,),
                SizedBox(
                  width: 200,
                  height: 50,
                  child: ElevatedButton(
                    child: Text('Create'),
                    onPressed: () {
                      //TODO: Add the submit function to create a new competition
                    },
                    
                  ),
                ),
              ],
            ),
          ),
          Divider(indent: 15, endIndent: 15,),
        ],
      ),
    );
  }
}